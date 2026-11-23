// services/backend/src/services/pairing.service.ts
//
// Browser extension <-> mobile device pairing (SRS UC-002, FR-003, FR-024).
//
//   1. Extension  POST /pairing/sessions        -> { pairingId, code, secret, expiresAt }
//                 shows { pairingId, code } as a QR; keeps `secret` locally.
//   2. Mobile     POST /pairing/claim (JWT)     -> links the pairing to the End User.
//   3. Extension  GET  /pairing/sessions/:id    (x-pairing-secret) -> sees "paired".
//   4. Extension  sends `x-pairing-secret` with every verification request, so the
//                 backend routes it to that End User's device only.
//
// Only SHA-256 hashes of the QR code and the secret are stored (CON-007).

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import prisma from "../lib/prisma.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error.middleware.js";

/** BR-002: a pairing QR code expires if not scanned within this window. */
export const PAIRING_QR_TTL_MS = 5 * 60 * 1000;

export const PAIRING_SECRET_HEADER = "x-pairing-secret";

export type PairingStatus = "pending" | "paired" | "expired" | "revoked";

export interface CreatedPairing {
  pairingId: string;
  code: string;
  secret: string;
  expiresAt: string;
  /** Exact string the extension encodes into the QR code. */
  qrPayload: string;
}

export interface PairingState {
  pairingId: string;
  status: PairingStatus;
  expiresAt: string;
  pairedAt: string | null;
}

export interface PairedDevice {
  pairingId: string;
  status: "paired" | "revoked";
  pairedAt: string | null;
  revokedAt: string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function effectiveStatus(row: {
  status: string;
  expiresAt: Date;
}): PairingStatus {
  if (row.status === "pending" && row.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return row.status as PairingStatus;
}

class PairingService {
  /** UC-002 step 1 — extension asks for a fresh QR code. */
  async createSession(): Promise<CreatedPairing> {
    const code = randomToken();
    const secret = randomToken();
    const expiresAt = new Date(Date.now() + PAIRING_QR_TTL_MS);

    const row = await prisma.devicePairing.create({
      data: {
        codeHash: sha256(code),
        secretHash: sha256(secret),
        expiresAt,
      },
    });

    return {
      pairingId: row.id,
      code,
      secret,
      expiresAt: expiresAt.toISOString(),
      qrPayload: JSON.stringify({
        v: 1,
        type: "nexusid-pair",
        pairingId: row.id,
        code,
      }),
    };
  }

  /** UC-002 step 5 — extension polls until the phone has claimed the code. */
  async getSessionState(
    pairingId: string,
    secret: string,
  ): Promise<PairingState> {
    const row = await prisma.devicePairing.findUnique({
      where: { id: pairingId },
    });

    // Wrong secret is indistinguishable from a missing pairing.
    if (!row || !hashesMatch(row.secretHash, sha256(secret))) {
      throw new NotFoundError("Pairing");
    }

    return {
      pairingId: row.id,
      status: effectiveStatus(row),
      expiresAt: row.expiresAt.toISOString(),
      pairedAt: row.pairedAt?.toISOString() ?? null,
    };
  }

  /** UC-002 steps 3-4 — signed-in mobile app claims the scanned code. */
  async claim(
    pairingId: string,
    code: string,
    userId: string,
  ): Promise<PairingState> {
    const row = await prisma.devicePairing.findUnique({
      where: { id: pairingId },
    });

    // 3.E1 — invalid code
    if (!row || !hashesMatch(row.codeHash, sha256(code))) {
      throw new ValidationError("This pairing code could not be verified");
    }

    const status = effectiveStatus(row);

    // 3.E1 — already used
    if (status === "paired" || status === "revoked") {
      throw new ConflictError("This pairing code has already been used");
    }

    // 1.E1 — expired before being scanned
    if (status === "expired") {
      throw new AppError(
        "This pairing code has expired. Generate a new one in the extension.",
        410,
      );
    }

    const pairedAt = new Date();

    // Conditional update so two concurrent claims cannot both succeed; the
    // throw rolls back the audit entry too.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.devicePairing.updateMany({
        where: {
          id: pairingId,
          status: "pending",
          expiresAt: { gt: pairedAt },
        },
        data: { status: "paired", userId, pairedAt },
      });

      if (updated.count === 0) {
        throw new ConflictError("This pairing code has already been used");
      }

      await tx.auditLog.create({
        data: {
          eventType: "device_paired",
          metadata: { user_id: userId, pairing_id: pairingId },
        },
      });
    });

    return {
      pairingId,
      status: "paired",
      expiresAt: row.expiresAt.toISOString(),
      pairedAt: pairedAt.toISOString(),
    };
  }

  /**
   * Resolves the End User an extension is paired with, from the secret it
   * sends on verification requests. Returns null when unpaired or revoked.
   */
  async resolvePairedUser(secret: string): Promise<string | null> {
    const row = await prisma.devicePairing.findUnique({
      where: { secretHash: sha256(secret) },
      select: { status: true, userId: true },
    });

    if (!row || row.status !== "paired" || !row.userId) return null;
    return row.userId;
  }

  /** FR-032 — the End User's paired browsers. */
  async listForUser(userId: string): Promise<PairedDevice[]> {
    const rows = await prisma.devicePairing.findMany({
      where: { userId, status: { in: ["paired", "revoked"] } },
      orderBy: { pairedAt: "desc" },
    });

    return rows.map((r) => ({
      pairingId: r.id,
      status: r.status as "paired" | "revoked",
      pairedAt: r.pairedAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
    }));
  }

  /** FR-032 — revoke a paired browser; its requests stop routing to this user. */
  async revoke(pairingId: string, userId: string): Promise<void> {
    const revokedAt = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.devicePairing.updateMany({
        where: { id: pairingId, userId, status: "paired" },
        data: { status: "revoked", revokedAt },
      });

      if (updated.count === 0) {
        throw new NotFoundError("Paired device");
      }

      await tx.auditLog.create({
        data: {
          eventType: "device_pairing_revoked",
          metadata: { user_id: userId, pairing_id: pairingId },
        },
      });
    });
  }
}

export const pairingService = new PairingService();
