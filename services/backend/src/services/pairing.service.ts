// services/backend/src/services/pairing.service.ts
//
// Browser <-> device pairings (SRS FR-003, FR-038; IF-003 API-026, API-027).
// A pairing is created by redeeming a PAIRING QR challenge
// (qr-challenge.service.ts). The extension then sends its pairing token on
// every relayed request (IF-005, API-032), and the backend routes the request
// only to the End User whose registered device redeemed that challenge.

import prisma from "../lib/prisma.js";
import { NotFoundError } from "../middleware/error.middleware.js";
import { sha256 } from "./qr-challenge.service.js";

/** Header carrying the extension's pairing token (SRS auth type "Pairing token"). */
export const PAIRING_TOKEN_HEADER = "x-pairing-token";

export interface Pairing {
  pairingId: string;
  status: "paired" | "revoked";
  pairedAt: string | null;
  revokedAt: string | null;
}

class PairingService {
  /**
   * Resolves the End User an extension is paired with, from its pairing
   * token. Returns null when unpaired or revoked.
   */
  async resolvePairedUser(pairingToken: string): Promise<string | null> {
    const row = await prisma.devicePairing.findUnique({
      where: { secretHash: sha256(pairingToken) },
      select: { status: true, userId: true },
    });

    if (!row || row.status !== "paired" || !row.userId) return null;
    return row.userId;
  }

  /** API-026 / FR-038 — the End User's paired browsers. */
  async listForUser(userId: string): Promise<Pairing[]> {
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

  /**
   * FR-038 from the browser side — the extension unpairs itself with its own
   * pairing token (no End User session in the browser). Idempotent: an
   * unknown, pending or already revoked token is a no-op.
   */
  async revokeByToken(pairingToken: string): Promise<void> {
    const revokedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const row = await tx.devicePairing.findUnique({
        where: { secretHash: sha256(pairingToken) },
        select: { id: true, userId: true, status: true },
      });
      if (!row || row.status !== "paired") return;

      await tx.devicePairing.update({
        where: { id: row.id },
        data: { status: "revoked", revokedAt },
      });
      await tx.auditLog.create({
        data: {
          eventType: "device_pairing_revoked",
          metadata: { user_id: row.userId, pairing_id: row.id, by: "extension" },
        },
      });
    });
  }

  /** API-027 / FR-038 — revoke a pairing; its requests stop routing to this user. */
  async revoke(pairingId: string, userId: string): Promise<void> {
    const revokedAt = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.devicePairing.updateMany({
        where: { id: pairingId, userId, status: "paired" },
        data: { status: "revoked", revokedAt },
      });

      if (updated.count === 0) {
        throw new NotFoundError("Pairing");
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
