import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { verifyProof } from "@nexusid/sd-jwt";
import prisma from "../lib/prisma.js";
import { notificationService } from "./notification.service.js";
import { pairingService } from "./pairing.service.js";
import { decodeSdJwtPayload, sdJwtCredentialId } from "../lib/sd-jwt-payload.js";
import type { Proof, VerificationStatus } from "@nexusid/types";

// ---------------------------------------------------------------------------
// Typed error classes
// ---------------------------------------------------------------------------

export class VerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface CreateSessionParams {
  verifierId: string;
  requestedFields: string[];
  callbackUrl?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  /** Backend-generated, single-use (FR-043, BR-005). The SP embeds it in its page. */
  nonce: string;
  requestedFields: string[];
  expiresAt: string;
}

export interface RelayRequestParams {
  sessionId: string;
  nonce: string;
  pageUrl: string;
  /** The extension's pairing token (x-pairing-token header, SRS IF-005). */
  pairingToken: string;
}

export interface RelayRequestResult {
  requestId: string;
  /** The extension's credential for polling this request (API-033). Shown once. */
  pollSecret: string;
  verifierName: string;
  requestedFields: string[];
  notification_sent: boolean;
  expiresAt: string;
}

export interface PollResult {
  status: VerificationStatus;
  expiresAt?: string;
  rejected_at?: string;
  verifiedFields?: Record<string, unknown>;
  callbackUrl?: string;
}

export interface SubmitProofParams {
  verification_requestId: string;
  proof: Proof;
  user_id: string;
}

export interface SubmitProofResult {
  status: "verified";
  verifiedFields: Record<string, unknown>;
  issuer: string;
  verifiedAt: string;
}

export interface HistoryRecord {
  requestId: string;
  verifierId: string;
  /** Requesting platform (UC-006). */
  verifierName: string;
  requestedFields: string[];
  /** When the user approved/declined; null if it expired unanswered. */
  decidedAt: string | null;
  verifiedFields: Record<string, unknown> | null;
  verifiedAt: string | null;
  status: VerificationStatus;
  created_at: string;
}

export interface PendingRequest {
  requestId: string;
  /** Verifier UUID — the key-binding JWT's `aud` must equal this. */
  verifierId: string;
  verifierName: string;
  verifierDomain: string | null;
  requestedFields: string[];
  /** Must be echoed in the key-binding JWT (BR-005). */
  nonce: string;
  pageUrl: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface HistoryResult {
  data: HistoryRecord[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verification response window, measured from session creation (FR-024, BR-022). */
export const RESPONSE_WINDOW_MS = 120 * 1000;

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Extract the `iss` claim from a compact JWT (or the JWT part of an SD-JWT)
 * WITHOUT verifying the signature.
 *
 * This is only used to locate the issuer's public key.
 * Full cryptographic verification happens later in verifyProof().
 */
function extractIssuerFromSDJWT(sdJwt: string): string {
  const payload = decodeSdJwtPayload(sdJwt);

  if (!payload) {
    throw new VerificationError(
      "Malformed SD-JWT: payload could not be decoded",
      "INVALID_JWT",
    );
  }

  if (typeof payload["iss"] !== "string" || !payload["iss"]) {
    throw new VerificationError(
      "SD-JWT missing required `iss` claim",
      "INVALID_JWT",
    );
  }

  return payload["iss"];
}

// ---------------------------------------------------------------------------
// VerificationService
// ---------------------------------------------------------------------------

export class VerificationService {
  // ─── API-030 POST /sessions (Service Provider, API key) ─────────────────

  /**
   * FR-043 — the Service Provider's server opens a session. The backend
   * generates the session ID and a single-use nonce; the SP embeds both in its
   * page for the extension to detect (FR-032). Nothing is routed yet.
   */
  async createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
    const { verifierId, requestedFields, callbackUrl } = params;

    const sessionId = uuidv4();
    const nonce = randomToken();
    const expiresAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    await prisma.$transaction([
      prisma.verificationRequest.create({
        data: {
          id: sessionId,
          verifierId,
          requestedFields,
          nonce,
          callbackUrl: callbackUrl ?? null,
          status: "pending",
          expiresAt,
        },
      }),
      prisma.auditLog.create({
        data: {
          eventType: "verification_session_created",
          requestId: sessionId,
          verifierId,
          metadata: { requestedFields },
        },
      }),
    ]);

    return {
      sessionId,
      nonce,
      requestedFields,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ─── API-032 POST /request (extension, pairing token) ─────────────────────

  /**
   * FR-032 — the extension relays a session it detected on a page. The
   * backend checks the session ID and nonce against the stored session and its
   * expiry, routes it to the paired End User only (FR-003), and notifies their
   * device (FR-019). An unknown, expired or invalid session is rejected and
   * nothing is sent to the End User.
   */
  async relayRequest(params: RelayRequestParams): Promise<RelayRequestResult> {
    const { sessionId, nonce, pageUrl, pairingToken } = params;

    // 0. Only a paired browser can relay (FR-003 AC3).
    const userId = pairingToken
      ? await pairingService.resolvePairedUser(pairingToken)
      : null;

    if (!userId) {
      throw new VerificationError(
        "This browser is not paired with a NexusID device. Pair it from the extension first.",
        "NOT_PAIRED",
        409,
      );
    }

    // 1. The session must exist and the nonce must be the one the backend
    // issued for it. A wrong nonce looks the same as an unknown session.
    const session = await prisma.verificationRequest.findUnique({
      where: { id: sessionId },
      include: { verifier: { select: { displayName: true } } },
    });

    if (!session || !sameSecret(session.nonce, nonce)) {
      throw new VerificationError(
        "Unknown verification session",
        "INVALID_SESSION",
        404,
      );
    }

    if (session.status === "pending" && new Date() > session.expiresAt) {
      await prisma.verificationRequest.update({
        where: { id: sessionId },
        data: { status: "expired" },
      });
    }
    if (session.status === "expired" || new Date() > session.expiresAt) {
      throw new VerificationError(
        "This verification session has expired. Reload the page to start a new one.",
        "SESSION_EXPIRED",
        410,
      );
    }

    // 2. A session is relayed once. The conditional update stops two relays
    // (or a replayed relay) from both succeeding.
    const pollSecret = randomToken();
    const relayedAt = new Date();
    const claimed = await prisma.verificationRequest.updateMany({
      where: {
        id: sessionId,
        status: "pending",
        userId: null,
        expiresAt: { gt: relayedAt },
      },
      data: {
        userId,
        pageUrl,
        relayedAt,
        pollSecretHash: sha256Hex(pollSecret),
      },
    });

    if (claimed.count === 0) {
      throw new VerificationError(
        "This verification session has already been used",
        "SESSION_ALREADY_RELAYED",
        409,
      );
    }

    const verifierName = session.verifier?.displayName ?? "Unknown platform";
    const requestedFields = session.requestedFields;

    // 3. Push only to the paired End User's device (FR-019).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });

    // A notification failure must never fail the relay.
    let notification_sent = false;
    if (user?.pushToken) {
      try {
        await notificationService.sendVerificationRequest({
          push_token: user.pushToken,
          verification_request_id: sessionId,
          verifier_id: session.verifierId ?? "",
          verifier_name: verifierName,
          requested_fields: requestedFields,
          nonce: session.nonce,
          expires_at: session.expiresAt.toISOString(),
        });
        notification_sent = true;
      } catch (err) {
        console.error("[VerificationService.relayRequest] FCM send failed:", err);
      }
    }

    // 4. Audit log.
    await prisma.auditLog.create({
      data: {
        eventType: "verification_request_created",
        requestId: sessionId,
        verifierId: session.verifierId,
        metadata: {
          requestedFields,
          pageUrl,
          notification_sent,
          users_notified: user?.pushToken ? 1 : 0,
        },
      },
    });

    return {
      requestId: sessionId,
      pollSecret,
      verifierName,
      requestedFields,
      notification_sent,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  // ─── API-031 GET /sessions/:id/outcome (Service Provider, API key) ────────

  /** FR-045 — the Service Provider's server reads the outcome of its session. */
  async getSessionOutcome(sessionId: string, verifierId: string): Promise<PollResult> {
    const request = await prisma.verificationRequest.findUnique({
      where: { id: sessionId },
    });

    // A verifier may only read its own sessions. Another verifier's session
    // is reported as not found so session IDs cannot be probed.
    if (!request || request.verifierId !== verifierId) {
      throw new VerificationError("Verification session not found", "NOT_FOUND", 404);
    }

    return this.buildOutcome(request);
  }

  // ─── API-033 GET /request/:id (extension, poll secret) ────────────────────

  /** FR-034 — the extension polls the outcome of a request it relayed. */
  async pollForExtension(requestId: string, pollSecret: string): Promise<PollResult> {
    const request = await prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });

    // A wrong secret is indistinguishable from a missing request.
    if (
      !request ||
      !request.pollSecretHash ||
      !sameSecret(request.pollSecretHash, sha256Hex(pollSecret))
    ) {
      throw new VerificationError("Verification request not found", "NOT_FOUND", 404);
    }

    return this.buildOutcome(request);
  }

  /** The outcome of one session, expiring it lazily once the window has passed. */
  private async buildOutcome(request: {
    id: string;
    status: string;
    expiresAt: Date;
    rejectedAt: Date | null;
    callbackUrl: string | null;
  }): Promise<PollResult> {
    if (request.status === "pending" && new Date() > request.expiresAt) {
      await prisma.verificationRequest.update({
        where: { id: request.id },
        data: { status: "expired" },
      });
      return { status: "expired" };
    }

    const status = request.status as VerificationStatus;

    switch (status) {
      case "pending":
        return {
          status: "pending",
          expiresAt: request.expiresAt.toISOString(),
        };

      case "rejected":
        return {
          status: "rejected",
          rejected_at: request.rejectedAt?.toISOString(),
        };

      case "expired":
        return {
          status: "expired",
        };

      case "completed": {
        const result = await prisma.verificationResult.findUnique({
          where: { requestId: request.id },
        });

        return {
          status: "completed",
          verifiedFields:
            (result?.verifiedFields as Record<string, unknown>) ?? {},
          callbackUrl: request.callbackUrl ?? undefined,
        };
      }

      default:
        throw new VerificationError(
          `Unexpected request status: ${status}`,
          "INTERNAL_ERROR",
          500,
        );
    }
  }

  // ─── POST /submit-proof ───────────────────────────────────────────────────

  async submitProof(params: SubmitProofParams): Promise<SubmitProofResult> {
    const { verification_requestId, proof, user_id } = params;

    // 1. Load and validate the request.
    const request = await prisma.verificationRequest.findUnique({
      where: {
        id: verification_requestId,
      },
    });

    // Only the End User the request was routed to may answer it; anyone else
    // gets the same 404 as for a missing request.
    if (!request || request.userId !== user_id) {
      throw new VerificationError(
        "Verification request not found",
        "NOT_FOUND",
        404,
      );
    }

    if (request.status !== "pending") {
      throw new VerificationError(
        `Request is not pending (status: ${request.status})`,
        "INVALID_STATUS",
        400,
      );
    }

    if (new Date() > request.expiresAt) {
      await prisma.verificationRequest.update({
        where: {
          id: verification_requestId,
        },
        data: {
          status: "expired",
        },
      });

      throw new VerificationError(
        "Verification request has expired",
        "REQUEST_EXPIRED",
        400,
      );
    }

    // 2. Resolve issuer public key from the SD-JWT.
    const issuerId = extractIssuerFromSDJWT(proof.presentation.sd_jwt);

    const issuerRecord = await prisma.issuerRegistry.findUnique({
      where: {
        issuerId,
      },
    });

    if (!issuerRecord || !issuerRecord.active) {
      throw new VerificationError(
        `Issuer '${issuerId}' is not in the trusted registry or is inactive`,
        "UNTRUSTED_ISSUER",
        400,
      );
    }

    // 3. Resolve user's registered public key.
    const userRecord = await prisma.user.findUnique({
      where: {
        id: user_id,
      },
      select: {
        publicKey: true,
      },
    });

    if (!userRecord) {
      throw new VerificationError("User not found", "USER_NOT_FOUND", 404);
    }

    if (!userRecord.publicKey) {
      throw new VerificationError(
        "User has no registered public key — cannot verify proof",
        "MISSING_PUBLIC_KEY",
        400,
      );
    }

    // 4. Full cryptographic proof verification.
    const verifyResult = await verifyProof(proof, {
      issuerPublicKey: issuerRecord.publicKey,
      userPublicKey: userRecord.publicKey,
      expectedNonce: request.nonce,
      verifierId: request.verifierId ?? "",
      // ALG-002 step 6: the proof must disclose exactly what was requested.
      expectedFields: request.requestedFields,
    });

    if (!verifyResult.valid) {
      // Record failed verification for audit/fraud analysis.
      await prisma.auditLog.create({
        data: {
          eventType: "proof_verification_failed",
          requestId: verification_requestId,
          verifierId: request.verifierId,
          metadata: {
            error: verifyResult.error ?? "unknown",
            user_id,
          },
        },
      });

      throw new VerificationError(
        verifyResult.error ?? "Proof verification failed",
        "PROOF_INVALID",
        400,
      );
    }

    // 4b. Revocation (BR-006). Postgres is the source of truth: a credential
    // the user revoked must not be usable, whatever the holder still stores.
    // Credentials the backend never recorded (no row) pass — same fail-open
    // stance as the blockchain cross-check.
    const credentialJti = sdJwtCredentialId(proof.presentation.sd_jwt);
    if (credentialJti) {
      const record = await prisma.credential.findUnique({
        where: { credentialJti },
        select: { status: true },
      });
      if (record?.status === "revoked") {
        await prisma.auditLog.create({
          data: {
            eventType: "proof_rejected_revoked",
            requestId: verification_requestId,
            verifierId: request.verifierId,
            metadata: { user_id, credential_jti: credentialJti },
          },
        });
        throw new VerificationError(
          "This credential has been revoked and cannot be used",
          "CREDENTIAL_REVOKED",
          400,
        );
      }
    }

    // 5. Commit result atomically.
    const verifiedAt = new Date();
    const proofHash = sha256Hex(JSON.stringify(proof));

    await prisma.$transaction([
      // Store verified fields.
      prisma.verificationResult.create({
        data: {
          id: uuidv4(),
          requestId: verification_requestId,
          verifiedFields: verifyResult.verifiedFields as object,
          issuer: verifyResult.issuer,
          proofHash,
          verifiedAt,
        },
      }),

      // Mark request completed.
      prisma.verificationRequest.update({
        where: {
          id: verification_requestId,
        },
        data: {
          status: "completed",
          completedAt: verifiedAt,
        },
      }),

      // Consume nonce to prevent replay.
      prisma.usedNonce.create({
        data: {
          nonce: request.nonce,
          usedAt: verifiedAt,
        },
      }),

      // Audit trail.
      prisma.auditLog.create({
        data: {
          eventType: "proof_verified",
          requestId: verification_requestId,
          verifierId: request.verifierId,
          metadata: {
            user_id,
            issuer: verifyResult.issuer,
            proofHash,
            fields_disclosed: Object.keys(verifyResult.verifiedFields),
          },
        },
      }),
    ]);

    return {
      status: "verified",
      verifiedFields: verifyResult.verifiedFields,
      issuer: verifyResult.issuer,
      verifiedAt: verifiedAt.toISOString(),
    };
  }

  // ─── POST /reject/:id ─────────────────────────────────────────────────────

  async rejectRequest(
    requestId: string,
    user_id: string,
  ): Promise<{ status: "rejected" }> {
    const request = await prisma.verificationRequest.findUnique({
      where: {
        id: requestId,
      },
    });

    // Only the End User the request was routed to may answer it; anyone else
    // gets the same 404 as for a missing request.
    if (!request || request.userId !== user_id) {
      throw new VerificationError(
        "Verification request not found",
        "NOT_FOUND",
        404,
      );
    }

    if (request.status !== "pending") {
      throw new VerificationError(
        `Cannot reject a request with status '${request.status}'`,
        "INVALID_STATUS",
        409,
      );
    }

    const rejectedAt = new Date();

    await prisma.$transaction([
      prisma.verificationRequest.update({
        where: {
          id: requestId,
        },
        data: {
          status: "rejected",
          rejectedAt,
        },
      }),

      prisma.auditLog.create({
        data: {
          eventType: "verification_rejected",
          requestId,
          verifierId: request.verifierId,
          metadata: {
            user_id,
            rejectedAt: rejectedAt.toISOString(),
          },
        },
      }),
    ]);

    return {
      status: "rejected",
    };
  }

  // ─── GET /pending ─────────────────────────────────────────────────────────

  /**
   * Requests routed to this End User (via pairing) that still await a
   * decision (SRS UC-004). Expired requests are excluded.
   */
  async getPendingForUser(user_id: string): Promise<PendingRequest[]> {
    const rows = await prisma.verificationRequest.findMany({
      where: {
        userId: user_id,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      include: { verifier: true },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r) => ({
      requestId: r.id,
      verifierId: r.verifierId ?? "",
      verifierName: r.verifier?.displayName ?? "Unknown verifier",
      verifierDomain: r.verifier?.domain ?? null,
      requestedFields: r.requestedFields,
      nonce: r.nonce,
      pageUrl: r.pageUrl,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  // ─── GET /history ─────────────────────────────────────────────────────────

  async getHistory(
    user_id: string,
    page: number,
    limit: number,
  ): Promise<HistoryResult> {
    const skip = (page - 1) * limit;

    // Find all request IDs this user acted on.
    const actedLogs = await prisma.auditLog.findMany({
      where: {
        eventType: {
          in: ["proof_verified", "verification_rejected"],
        },
        metadata: {
          path: ["user_id"],
          equals: user_id,
        },
      },
      select: {
        requestId: true,
      },
      distinct: ["requestId"],
    });

    const requestIds = actedLogs
      .map((log) => log.requestId)
      .filter((id): id is string => id !== null);

    // Requests routed to this user via pairing (incl. expired ones), plus any
    // they acted on before routing existed. Pending requests live on /pending.
    const where = {
      OR: [{ userId: user_id }, { id: { in: requestIds } }],
      status: { not: "pending" },
    };

    const [total, requests] = await Promise.all([
      prisma.verificationRequest.count({ where }),

      prisma.verificationRequest.findMany({
        where,
        include: {
          result: true,
          verifier: { select: { displayName: true } },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
    ]);

    const data: HistoryRecord[] = requests.map((r) => ({
      requestId: r.id,
      verifierId: r.verifierId ?? "",
      verifierName: r.verifier?.displayName ?? "Unknown verifier",
      requestedFields: r.requestedFields,
      decidedAt: (r.completedAt ?? r.rejectedAt)?.toISOString() ?? null,
      verifiedFields: r.result
        ? (r.result.verifiedFields as Record<string, unknown>)
        : null,
      verifiedAt: r.result?.verifiedAt.toISOString() ?? null,
      status: r.status as VerificationStatus,
      created_at: r.createdAt.toISOString(),
    }));

    return {
      data,
      total,
      page,
      limit,
    };
  }
}

export const verificationService = new VerificationService();
