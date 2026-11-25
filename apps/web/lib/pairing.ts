// apps/web/lib/pairing.ts
//
// Web stand-in for the phone's side of device pairing (SRS FR-003, API-025),
// used while the mobile app is not runnable. The extension's QR encodes a
// web-portal link:
//
//     <web origin>/pair#p=<challengeId>&c=<code>            (PAIRING, extension)
//     <web origin>/pair#p=<challengeId>&c=<code>&t=SIGN_IN  (FR-036 portal sign-in)
//
// Redeeming signs the challenge with this browser's device key (a
// non-extractable WebCrypto key, lib/webKeypair.ts), so the backend runs the
// same ALG-006 + ALG-007 checks it runs for the phone.
//
// The older raw-JSON form {"v":1,"type":"nexusid-pair",pairingId,code} is
// still accepted when pasted.

import { z } from "zod";
import { ensureWebKeypair, getWebSigningKey } from "@/lib/webKeypair";

export type QrPurpose = "PAIRING" | "SIGN_IN";

export interface ScannedChallenge {
  challengeId: string;
  code: string;
  purpose: QrPurpose;
}

const ChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(1).max(256),
  purpose: z.enum(["PAIRING", "SIGN_IN"]),
});

const LegacyJsonSchema = z.object({
  v: z.literal(1),
  type: z.literal("nexusid-pair"),
  pairingId: z.string(),
  code: z.string(),
});

/** sessionStorage key that carries a scanned code across the login redirect. */
export const PENDING_PAIRING_KEY = "nexusid_pending_pairing";

/**
 * What the device signs to redeem a pairing challenge (ALG-007). Must match
 * qrChallengeSigningInput in services/backend/src/services/qr-challenge.service.ts.
 */
function signingInput({ purpose, challengeId, code }: ScannedChallenge): string {
  return `nexusid-qr:${purpose}:${challengeId}:${code}`;
}

/** Parses the fragment of a QR link: `p=<id>&c=<code>[&t=SIGN_IN]` (leading `#` optional). */
export function parsePairingFragment(
  fragment: string,
): ScannedChallenge | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const parsed = ChallengeSchema.safeParse({
    challengeId: params.get("p"),
    code: params.get("c"),
    purpose: params.get("t") ?? "PAIRING",
  });
  return parsed.success ? parsed.data : null;
}

/** Parses whatever the user pasted: a pairing link, or legacy JSON. */
export function parsePairingInput(raw: string): ScannedChallenge | null {
  const text = raw.trim();

  if (text.startsWith("{")) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      return null;
    }
    const legacy = LegacyJsonSchema.safeParse(decoded);
    if (!legacy.success) return null;
    const parsed = ChallengeSchema.safeParse({
      challengeId: legacy.data.pairingId,
      code: legacy.data.code,
      purpose: "PAIRING",
    });
    return parsed.success ? parsed.data : null;
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!url.pathname.replace(/\/+$/, "").endsWith("/pair")) return null;
  return parsePairingFragment(url.hash);
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer))
    binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Signs the challenge with this browser's device key (RSA-SHA256, CON-007). */
async function signChallenge(challenge: ScannedChallenge): Promise<string> {
  let key = await getWebSigningKey();
  if (!key) {
    // First use in this browser: create and register its device key.
    await ensureWebKeypair();
    key = await getWebSigningKey();
  }
  if (!key) throw new Error("This browser has no device key to sign with");

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key.privateKey,
    new TextEncoder().encode(signingInput(challenge)),
  );
  return toBase64(signature);
}

/**
 * API-025: redeems the scanned code — PAIRING links the extension to this
 * account; SIGN_IN approves the portal sign-in shown on another screen (FR-036).
 */
export async function redeemPairingChallenge(
  challenge: ScannedChallenge,
): Promise<void> {
  const signature = await signChallenge(challenge);

  const res = await fetch("/api/v1/qr-challenges/redeem", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      code: challenge.code,
      signature,
    }),
  });
  const json = (await res.json()) as { success: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(
      json.error ??
        (challenge.purpose === "SIGN_IN" ? "Sign-in failed" : "Pairing failed"),
    );
  }
}
