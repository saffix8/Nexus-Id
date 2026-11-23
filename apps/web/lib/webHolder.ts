// apps/web/lib/webHolder.ts
//
// Browser holder: builds an SD-JWT presentation + key-binding JWT for the web
// stand-in approval screen (SRS UC-004 / MOD-5).
//
// This MIRRORS packages/sd-jwt/src/holder.ts (selectDisclosures,
// computeSdHash, createKeyBinding, generateProof). That package hashes with
// Node's `crypto`, which does not exist in the browser, and .claude/rules/
// sd-jwt.md forbids changing the package without a separate proposal. The
// only difference here is SHA-256 via Web Crypto (crypto.subtle) instead of
// Node crypto — the disclosure format, sd_hash input and KB-JWT claims are
// identical. Any change to holder.ts must be mirrored here.
//
// Output is checked against the real backend verifier (@nexusid/sd-jwt
// verifyProof) — see the cross-check in the session notes / tests.

import { SignJWT, importPKCS8, base64url } from "jose";
import type { Presentation, Proof, SDJWTCredential } from "@nexusid/types";

export class DisclosureNotFoundError extends Error {
  constructor(public readonly field: string) {
    super(`This credential does not contain the field "${field}".`);
    this.name = "DisclosureNotFoundError";
  }
}

export interface DecodedDisclosure {
  salt: string;
  field: string;
  value: unknown;
}

/** base64url "[salt, field, value]" -> parts. Mirrors decodeDisclosureInternal. */
export function decodeDisclosure(disclosure: string): DecodedDisclosure {
  const json = new TextDecoder().decode(base64url.decode(disclosure));
  const parsed: unknown = JSON.parse(json);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new Error("Malformed disclosure");
  }
  return { salt: parsed[0], field: parsed[1], value: parsed[2] };
}

/** Field names this credential can selectively disclose. */
export function disclosableFields(credential: SDJWTCredential): string[] {
  return credential.disclosures.map((d) => decodeDisclosure(d).field);
}

/**
 * Only the disclosures for the requested fields. Mirrors selectDisclosures:
 * throws if any requested field is missing.
 */
export function selectDisclosures(
  credential: SDJWTCredential,
  requestedFields: string[],
): string[] {
  const byField = new Map<string, string>();
  for (const d of credential.disclosures) {
    byField.set(decodeDisclosure(d).field, d);
  }
  return requestedFields.map((field) => {
    const d = byField.get(field);
    if (d === undefined) throw new DisclosureNotFoundError(field);
    return d;
  });
}

/**
 * sd_hash = BASE64URL(SHA-256(<sd_jwt>~<d1>~...~<dn>~)).
 * The trailing "~" is required by RFC 9901 §6.2 even with no disclosures.
 */
async function computeSdHash(presentation: Presentation): Promise<string> {
  const presentationString = [
    presentation.sd_jwt,
    ...presentation.disclosures,
    "",
  ].join("~");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(presentationString),
  );
  return base64url.encode(new Uint8Array(digest));
}

/** kb+jwt over the presentation, bound to verifier (aud) and nonce. */
async function createKeyBinding(params: {
  presentation: Presentation;
  verifierId: string;
  nonce: string;
  signingKey: CryptoKey | string;
}): Promise<string> {
  const sdHash = await computeSdHash(params.presentation);
  // A non-extractable CryptoKey (web vault) signs directly; a PKCS#8 PEM is
  // accepted too so the output can be cross-checked in Node.
  const privateKey =
    typeof params.signingKey === "string"
      ? await importPKCS8(params.signingKey, "RS256")
      : params.signingKey;

  return new SignJWT({ nonce: params.nonce, sd_hash: sdHash })
    .setProtectedHeader({ alg: "RS256", typ: "kb+jwt" })
    .setAudience(params.verifierId)
    .setIssuedAt()
    .sign(privateKey);
}

/** Complete Proof for POST /verification/submit-proof. Mirrors generateProof. */
export async function generateProof(params: {
  credential: SDJWTCredential;
  requestedFields: string[];
  verifierId: string;
  nonce: string;
  /** Holder key: non-extractable CryptoKey in the browser, or PKCS#8 PEM. */
  signingKey: CryptoKey | string;
}): Promise<Proof> {
  const presentation: Presentation = {
    sd_jwt: params.credential.sd_jwt,
    disclosures: selectDisclosures(params.credential, params.requestedFields),
  };

  const keyBinding = await createKeyBinding({
    presentation,
    verifierId: params.verifierId,
    nonce: params.nonce,
    signingKey: params.signingKey,
  });

  return {
    presentation,
    key_binding: keyBinding,
    timestamp: new Date().toISOString(),
    verifier_id: params.verifierId,
  };
}
