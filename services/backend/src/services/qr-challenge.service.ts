// services/backend/src/services/qr-challenge.service.ts
//
// Single-use QR challenges (SRS IF-003: API-023, API-024, API-025).
//
//   1. Extension  POST /qr-challenges { purpose: "PAIRING" }    (API-023, FR-031)
//                 -> { challengeId, code, pairingToken, expiresAt, qrPayload }
//                 Draws qrPayload as a QR; keeps pairingToken locally.
//   2. Phone      POST /qr-challenges/redeem (Device JWT)        (API-025, FR-003)
//                 { challengeId, code, signature } where signature is the
//                 device key's RSA-SHA256 signature over
//                 qrChallengeSigningInput(purpose, challengeId, code).
//                 ALG-006 checks purpose / expiry / single use; ALG-007 checks
//                 the signature against the account's registered device key.
//   3. Extension  GET /qr-challenges/:id (x-pairing-token)       (API-024)
//                 -> state REDEEMED; the pairing token is now live and is sent
//                 on every relayed request (API-032).
//
// The QR payload is a web-portal link (<PAIRING_WEB_URL>/pair#p=..&c=..). The
// NexusID app reads it directly; until the app is runnable, a phone camera can
// open it on the web portal, which signs with the browser's device key
// (apps/web/lib/webKeypair.ts) and calls the same API-025.
//
// Only SHA-256 hashes of the code and the pairing token are stored (CON-007).
// A redeemed PAIRING challenge row *is* the pairing (see pairing.service.ts).
//
// FR-036 portal sign-in (purpose SIGN_IN) will reuse this flow; it is not
// implemented yet, so only PAIRING is accepted for now.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import prisma from "../lib/prisma.js";
import { verifyDeviceSignature } from "../lib/device-signature.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error.middleware.js";

/** QR validity window (BR-022, FR-031, ALG-006). */
export const QR_VALIDITY_MS = 120 * 1000;

export const QR_CHALLENGE_PURPOSES = ["PAIRING"] as const;
export type QrChallengePurpose = (typeof QR_CHALLENGE_PURPOSES)[number];

export type QrChallengeState = "PENDING" | "REDEEMED" | "EXPIRED";

export interface CreatedQrChallenge {
  challengeId: string;
  purpose: QrChallengePurpose;
  code: string;
  /** The extension's credential for this pairing once redeemed (IF-005). */
  pairingToken: string;
  expiresAt: string;
  /** Exact string the extension encodes into the QR code. */
  qrPayload: string;
}

export interface QrChallengeStatus {
  challengeId: string;
  purpose: QrChallengePurpose;
  state: QrChallengeState;
  expiresAt: string;
  redeemedAt: string | null;
}

/**
 * Web portal origin the QR links to. For a phone to open it, set this to an
 * address the phone can reach, e.g. http://192.168.1.20:3000.
 */
const PAIRING_WEB_URL = (
  process.env.PAIRING_WEB_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/**
 * The exact string the device signs to redeem a challenge (ALG-007). Binding
 * the purpose and challenge ID stops a signature being replayed elsewhere.
 * Mirrored in apps/web/lib/pairing.ts and apps/mobile PairBrowserScreen.
 */
export function qrChallengeSigningInput(
  purpose: QrChallengePurpose,
  challengeId: string,
  code: string,
): string {
  return `nexusid-qr:${purpose}:${challengeId}:${code}`;
}

/**
 * The string encoded into the QR code. Values sit in the URL fragment, which
 * browsers never send to a server, so the one-time code stays out of logs.
 */
export function buildPairingQrPayload(
  challengeId: string,
  code: string,
): string {
  const fragment = new URLSearchParams({ p: challengeId, c: code }).toString();
  return `${PAIRING_WEB_URL}/pair#${fragment}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Challenge state as the SRS names it, from the stored pairing row. */
function challengeState(row: {
  status: string;
  expiresAt: Date;
}): QrChallengeState {
  if (row.status !== "pending") return "REDEEMED"; // paired, or paired then revoked
  return row.expiresAt.getTime() <= Date.now() ? "EXPIRED" : "PENDING";
}

class QrChallengeService {
  /** API-023 / FR-031 — create a unique, single-use QR challenge. */
  async create(purpose: QrChallengePurpose): Promise<CreatedQrChallenge> {
    const code = randomToken();
    const pairingToken = randomToken();
    const expiresAt = new Date(Date.now() + QR_VALIDITY_MS);

    const row = await prisma.devicePairing.create({
      data: {
        codeHash: sha256(code),
        secretHash: sha256(pairingToken),
        expiresAt,
      },
    });

    return {
      challengeId: row.id,
      purpose,
      code,
      pairingToken,
      expiresAt: expiresAt.toISOString(),
      qrPayload: buildPairingQrPayload(row.id, code),
    };
  }

  /** API-024 — the extension polls with its pairing token. */
  async getStatus(
    challengeId: string,
    pairingToken: string,
  ): Promise<QrChallengeStatus> {
    const row = await prisma.devicePairing.findUnique({
      where: { id: challengeId },
    });

    // A wrong token is indistinguishable from a missing challenge.
    if (!row || !hashesMatch(row.secretHash, sha256(pairingToken))) {
      throw new NotFoundError("QR challenge");
    }

    return {
      challengeId: row.id,
      purpose: "PAIRING",
      state: challengeState(row),
      expiresAt: row.expiresAt.toISOString(),
      redeemedAt: row.pairedAt?.toISOString() ?? null,
    };
  }

  /** API-025 — the signed-in device redeems a scanned code (ALG-006 + ALG-007). */
  async redeem(params: {
    challengeId: string;
    code: string;
    signature: string;
    userId: string;
  }): Promise<QrChallengeStatus> {
    const { challengeId, code, signature, userId } = params;

    const row = await prisma.devicePairing.findUnique({
      where: { id: challengeId },
    });

    // ALG-006 — unknown challenge or wrong code
    if (!row || !hashesMatch(row.codeHash, sha256(code))) {
      throw new ValidationError("This QR code could not be verified");
    }

    // ALG-006 — single use (BR-002)
    const state = challengeState(row);
    if (state === "REDEEMED") {
      throw new ConflictError("This QR code has already been used");
    }
    // ALG-006 — QR validity window (BR-002, BR-022)
    if (state === "EXPIRED") {
      throw new AppError(
        "This QR code has expired. Generate a new one in the extension.",
        410,
      );
    }

    // ALG-007 — the account's registered device key must have signed it.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });
    if (!user?.publicKey) {
      throw new AppError("No device key is registered for this account", 401);
    }
    const signed = qrChallengeSigningInput("PAIRING", challengeId, code);
    if (!verifyDeviceSignature(user.publicKey, signed, signature)) {
      throw new AppError(
        "Device signature verification failed. This device's key does not match the account.",
        401,
      );
    }

    const redeemedAt = new Date();

    // Conditional update so two concurrent redeems cannot both succeed; the
    // throw rolls back the audit entry too.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.devicePairing.updateMany({
        where: {
          id: challengeId,
          status: "pending",
          expiresAt: { gt: redeemedAt },
        },
        data: { status: "paired", userId, pairedAt: redeemedAt },
      });
      if (updated.count === 0) {
        throw new ConflictError("This QR code has already been used");
      }
      await tx.auditLog.create({
        data: {
          eventType: "device_paired",
          metadata: { user_id: userId, pairing_id: challengeId },
        },
      });
    });

    return {
      challengeId,
      purpose: "PAIRING",
      state: "REDEEMED",
      expiresAt: row.expiresAt.toISOString(),
      redeemedAt: redeemedAt.toISOString(),
    };
  }
}

export const qrChallengeService = new QrChallengeService();
