// services/backend/src/services/qr-challenge.service.ts
//
// Single-use QR challenges (SRS IF-003: API-023, API-024, API-025).
//
// Two purposes share one flow:
//
//   PAIRING (FR-003, FR-031) — the extension links itself to the End User's phone.
//   1. Extension  POST /qr-challenges { purpose: "PAIRING" }    (API-023)
//                 -> { challengeId, code, pairingToken, expiresAt, qrPayload }
//   2. Phone      POST /qr-challenges/redeem (Device JWT)        (API-025)
//   3. Extension  GET /qr-challenges/:id (x-pairing-token)       (API-024)
//                 -> state REDEEMED; the pairing token is now live and is sent
//                 on every relayed request (API-032).
//
//   SIGN_IN (FR-036) — the End User signs in to the web portal with the phone,
//   no password (WhatsApp Web style).
//   1. Portal     POST /qr-challenges { purpose: "SIGN_IN" }     (API-023)
//                 -> { challengeId, code, pollToken, expiresAt, qrPayload }
//   2. Phone      POST /qr-challenges/redeem (Device JWT)        (API-025)
//   3. Portal     GET /qr-challenges/:id (x-challenge-token)     (API-024)
//                 -> state REDEEMED + sessionToken, handed out exactly once.
//
// Redeeming: the device signs qrChallengeSigningInput(purpose, id, code) with
// its registered key. ALG-006 checks purpose / expiry / single use; ALG-007
// checks the signature against the account's registered device key.
//
// The QR payload is a web-portal link (<PAIRING_WEB_URL>/pair#p=..&c=..[&t=SIGN_IN]).
// The NexusID app reads it directly; the web portal's /pair page is the
// stand-in that signs with the browser's device key (apps/web/lib/webKeypair.ts).
//
// Only SHA-256 hashes of the code and the poll/pairing token are stored
// (CON-007). A redeemed PAIRING row *is* the pairing (see pairing.service.ts);
// SIGN_IN rows live in their own table so they can never route requests.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import prisma from "../lib/prisma.js";
import { verifyDeviceSignature } from "../lib/device-signature.js";
import { browserLabelOf } from "../lib/user-agent.js";
import { issueToken } from "../controllers/web-auth.controller.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error.middleware.js";

/** QR validity window (BR-022, FR-031, ALG-006). */
export const QR_VALIDITY_MS = 120 * 1000;

/**
 * An approved sign-in must be collected by the portal soon after; it polls
 * every 2 s, so this only covers a closed tab or a dropped connection.
 */
const SIGN_IN_COLLECT_MS = 60 * 1000;

export const QR_CHALLENGE_PURPOSES = ["PAIRING", "SIGN_IN"] as const;
export type QrChallengePurpose = (typeof QR_CHALLENGE_PURPOSES)[number];

export type QrChallengeState = "PENDING" | "REDEEMED" | "EXPIRED";

export interface CreatedQrChallenge {
  challengeId: string;
  purpose: QrChallengePurpose;
  code: string;
  /** PAIRING: the extension's credential for this pairing once redeemed (IF-005). */
  pairingToken?: string;
  /** SIGN_IN: what the portal polls API-024 with. */
  pollToken?: string;
  expiresAt: string;
  /** Exact string to encode into the QR code. */
  qrPayload: string;
}

export interface QrChallengeStatus {
  challengeId: string;
  purpose: QrChallengePurpose;
  state: QrChallengeState;
  expiresAt: string;
  redeemedAt: string | null;
  /** PAIRING: true while the pairing is live (redeemed and not revoked). */
  active: boolean;
  /** Paired phone's model from its registration device_info, if known. */
  deviceName: string | null;
  /**
   * SIGN_IN only: the End User's portal session JWT. Present in exactly one
   * API-024 response, the first poll after the phone approved (FR-036 AC3).
   */
  sessionToken?: string;
  sessionExpiresAt?: string;
}

/** Reads a display name from the device_info JSON the app registered with. */
function deviceNameOf(info: unknown): string | null {
  if (!info || typeof info !== "object") return null;
  const d = info as Record<string, unknown>;
  for (const key of ["model", "deviceName", "device_name", "name"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 64);
  }
  return null;
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
 * the purpose and challenge ID stops a signature being replayed elsewhere:
 * a pairing signature can never sign someone in, and vice versa.
 * Mirrored in apps/web/lib/pairing.ts and apps/mobile/src/services/crypto.service.ts.
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
 * `t` is omitted for PAIRING so v1.0 extensions/apps keep working.
 */
export function buildQrPayload(
  purpose: QrChallengePurpose,
  challengeId: string,
  code: string,
): string {
  const params: Record<string, string> = { p: challengeId, c: code };
  if (purpose !== "PAIRING") params.t = purpose;
  return `${PAIRING_WEB_URL}/pair#${new URLSearchParams(params).toString()}`;
}

/** Kept for existing callers. */
export function buildPairingQrPayload(
  challengeId: string,
  code: string,
): string {
  return buildQrPayload("PAIRING", challengeId, code);
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

/** Challenge state as the SRS names it, from the stored row. */
function challengeState(row: {
  status: string;
  expiresAt: Date;
}): QrChallengeState {
  if (row.status !== "pending") return "REDEEMED"; // paired/approved/consumed/revoked
  return row.expiresAt.getTime() <= Date.now() ? "EXPIRED" : "PENDING";
}

/** Either kind of challenge row, for redeem's shared ALG-006 checks. */
type ChallengeRow = {
  purpose: QrChallengePurpose;
  id: string;
  codeHash: string;
  status: string;
  expiresAt: Date;
};

async function findChallenge(
  challengeId: string,
): Promise<ChallengeRow | null> {
  const pairing = await prisma.devicePairing.findUnique({
    where: { id: challengeId },
  });
  if (pairing) return { purpose: "PAIRING", ...pairing };
  const signIn = await prisma.portalSignIn.findUnique({
    where: { id: challengeId },
  });
  return signIn ? { purpose: "SIGN_IN", ...signIn } : null;
}

class QrChallengeService {
  /** API-023 / FR-031, FR-036 — create a unique, single-use QR challenge. */
  async create(
    purpose: QrChallengePurpose,
    userAgent?: string | null,
  ): Promise<CreatedQrChallenge> {
    const code = randomToken();
    const secret = randomToken();
    const expiresAt = new Date(Date.now() + QR_VALIDITY_MS);
    const data = {
      codeHash: sha256(code),
      secretHash: sha256(secret),
      expiresAt,
      browserLabel: browserLabelOf(userAgent),
    };

    const row =
      purpose === "PAIRING"
        ? await prisma.devicePairing.create({ data })
        : await prisma.portalSignIn.create({ data });

    return {
      challengeId: row.id,
      purpose,
      code,
      ...(purpose === "PAIRING"
        ? { pairingToken: secret }
        : { pollToken: secret }),
      expiresAt: expiresAt.toISOString(),
      qrPayload: buildQrPayload(purpose, row.id, code),
    };
  }

  /** API-024 — the extension (pairing token) or the portal (poll token) polls. */
  async getStatus(
    challengeId: string,
    token: string,
  ): Promise<QrChallengeStatus> {
    const row = await prisma.devicePairing.findUnique({
      where: { id: challengeId },
      include: { user: { select: { deviceInfo: true } } },
    });

    if (!row) return this.getSignInStatus(challengeId, token);

    // A wrong token is indistinguishable from a missing challenge.
    if (!hashesMatch(row.secretHash, sha256(token))) {
      throw new NotFoundError("QR challenge");
    }

    const active = row.status === "paired";
    return {
      challengeId: row.id,
      purpose: "PAIRING",
      state: challengeState(row),
      expiresAt: row.expiresAt.toISOString(),
      redeemedAt: row.pairedAt?.toISOString() ?? null,
      active,
      deviceName: active ? deviceNameOf(row.user?.deviceInfo) : null,
    };
  }

  /** API-024 for SIGN_IN — hands out the session exactly once (FR-036 AC3). */
  private async getSignInStatus(
    challengeId: string,
    pollToken: string,
  ): Promise<QrChallengeStatus> {
    const row = await prisma.portalSignIn.findUnique({
      where: { id: challengeId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!row || !hashesMatch(row.secretHash, sha256(pollToken))) {
      throw new NotFoundError("QR challenge");
    }

    const base: QrChallengeStatus = {
      challengeId: row.id,
      purpose: "SIGN_IN",
      state: challengeState(row),
      expiresAt: row.expiresAt.toISOString(),
      redeemedAt: row.approvedAt?.toISOString() ?? null,
      active: false,
      deviceName: null,
    };

    if (row.status !== "approved" || !row.user || !row.approvedAt) return base;
    if (Date.now() - row.approvedAt.getTime() > SIGN_IN_COLLECT_MS) return base;

    // Conditional update: two concurrent polls cannot both get a session.
    const consumedAt = new Date();
    const claimed = await prisma.portalSignIn.updateMany({
      where: { id: row.id, status: "approved" },
      data: { status: "consumed", consumedAt },
    });
    if (claimed.count === 0) return base;

    const { token, expiresAt } = await issueToken(row.user);
    await prisma.auditLog.create({
      data: {
        eventType: "portal_sign_in",
        metadata: { user_id: row.user.id, challenge_id: row.id },
      },
    });

    return {
      ...base,
      sessionToken: token,
      sessionExpiresAt: expiresAt.toISOString(),
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

    const row = await findChallenge(challengeId);

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
        row.purpose === "PAIRING"
          ? "This QR code has expired. Generate a new one in the extension."
          : "This QR code has expired. The sign-in page shows a new one.",
        410,
      );
    }

    // ALG-007 — the account's registered device key must have signed it
    // (FR-036 AC2: an unpaired device or a bad signature is refused).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true, deviceInfo: true },
    });
    if (!user?.publicKey) {
      throw new AppError("No device key is registered for this account", 401);
    }
    const signed = qrChallengeSigningInput(row.purpose, challengeId, code);
    if (!verifyDeviceSignature(user.publicKey, signed, signature)) {
      throw new AppError(
        "Device signature verification failed. This device's key does not match the account.",
        401,
      );
    }

    const redeemedAt = new Date();
    const open = {
      id: challengeId,
      status: "pending",
      expiresAt: { gt: redeemedAt },
    };

    // Conditional update so two concurrent redeems cannot both succeed; the
    // throw rolls back the audit entry too.
    await prisma.$transaction(async (tx) => {
      const updated =
        row.purpose === "PAIRING"
          ? await tx.devicePairing.updateMany({
              where: open,
              data: { status: "paired", userId, pairedAt: redeemedAt },
            })
          : await tx.portalSignIn.updateMany({
              where: open,
              data: { status: "approved", userId, approvedAt: redeemedAt },
            });
      if (updated.count === 0) {
        throw new ConflictError("This QR code has already been used");
      }
      await tx.auditLog.create({
        data: {
          eventType:
            row.purpose === "PAIRING"
              ? "device_paired"
              : "portal_sign_in_approved",
          metadata: {
            user_id: userId,
            [row.purpose === "PAIRING" ? "pairing_id" : "challenge_id"]:
              challengeId,
          },
        },
      });
    });

    return {
      challengeId,
      purpose: row.purpose,
      state: "REDEEMED",
      expiresAt: row.expiresAt.toISOString(),
      redeemedAt: redeemedAt.toISOString(),
      active: row.purpose === "PAIRING",
      deviceName: deviceNameOf(user.deviceInfo),
    };
  }
}

export const qrChallengeService = new QrChallengeService();
