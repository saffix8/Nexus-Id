import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import {
  verifyProof,
  isPredicateCode,
  predicateLabel,
  PREDICATE_CATALOG,
} from "@nexusid/sd-jwt";
import prisma from "../lib/prisma.js";
import { notificationService } from "./notification.service.js";
import { pairingService } from "./pairing.service.js";
import {
  decodeSdJwtPayload,
  sdJwtCredentialId,
} from "../lib/sd-jwt-payload.js";
import type {
  Proof,
  VerificationStatus,
  VerificationOutcome,
} from "@nexusid/types";

// ---------------------------------------------------------------------------
// Typed error classes
// ---------------------------------------------------------------------------

export class VerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreateSessionParams {
  verifierId: string;
  /** Catalog predicate code (FR-043, BR-021). */
  predicate: string;
  /** The provider's configured predicates (FR-041). */
  configuredPredicates: string[];
  callbackUrl?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  /** Backend-generated, single-use (FR-043, BR-005). The SP embeds it in its page. */
  nonce: string;
  predicate: string;
  predicateLabel: string;
  /** Legacy alias of [predicate] for older clients. */
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
  predicate: string;
  predicateLabel: string;
  /** Legacy alias of [predicate] for older clients. */
  requestedFields: string[];
  notification_sent: boolean;
  expiresAt: string;
}

/**
 * The outcome of one session (FR-045). Contains no claim values (AC6, BR-015):
 * only the condition, the outcome and the issuer that vouched for it.
 */
export interface OutcomeResult {
  status: VerificationStatus;
  outcome: VerificationOutcome;
  predicate: string;
  predicateLabel: string;
  expiresAt?: string;
  /** When the session was closed (answered, failed or expired). */
  decidedAt?: string;
  rejected_at?: string;
  issuer?: string | null;
  callbackUrl?: string;
}

export interface SubmitProofParams {
  verification_requestId: string;
  proof: Proof;
  user_id: string;
}

export interface SubmitProofResult {
  status: "verified";
  outcome: "VERIFIED";
  predicate: string;
  issuer: string;
  verifiedAt: string;
}

export interface HistoryRecord {
  requestId: string;
  verifierId: string;
  /** Requesting platform (UC-006). */
  verifierName: string;
  predicate: string;
  predicateLabel: string;
  /** Legacy alias of [predicate] for older clients. */
  requestedFields: string[];
  /** When the session was closed; null if it expired unanswered. */
  decidedAt: string | null;
  outcome: VerificationOutcome;
  issuer: string | null;
  status: VerificationStatus;
  created_at: string;
}

export interface PendingRequest {
  requestId: string;
  /** Verifier UUID — the key-binding JWT's `aud` must equal this. */
  verifierId: string;
  verifierName: string;
  verifierDomain: string | null;
  predicate: string;
  predicateLabel: string;
  /** Legacy alias of [predicate] for older clients. */
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
// Constants and helpers
// ---------------------------------------------------------------------------

/** Verification response window, measured from session creation (FR-024, BR-022). */
export const RESPONSE_WINDOW_MS = 120 * 1000;

/** How often ALG-005 sweeps for timed-out sessions. */
export const EXPIRY_SWEEP_INTERVAL_MS = 5 * 1000;

const OUTCOME_BY_STATUS: Record<VerificationStatus, VerificationOutcome> = {
  pending: "PENDING",
  completed: "VERIFIED",
  failed: "FAILED",
  rejected: "DECLINED",
  expired: "EXPIRED",
};

export function outcomeOf(status: string): VerificationOutcome {
  return OUTCOME_BY_STATUS[status as VerificationStatus] ?? "FAILED";
}

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

/** The session's predicate; legacy rows only have requested_fields. */
function sessionPredicate(r: {
  predicate: string | null;
  requestedFields: string[];
}): string {
  return r.predicate ?? r.requestedFields[0] ?? "";
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

type SessionRow = Prisma.VerificationRequestGetPayload<Record<string, never>>;

/** ALG-002 check result. */
type CheckResult =
  | { ok: true; issuer: string }
  | { ok: false; code: string; message: string; issuer: string | null };

/** Maps an sd-jwt verifier error to an ALG-002 failure code. */
function classifyProofError(message: string): string {
  if (/^Credential has expired/i.test(message)) return "CREDENTIAL_EXPIRED";
  if (/too old|in the future/i.test(message)) return "PROOF_TOO_OLD";
  if (/nonce/i.test(message)) return "NONCE_MISMATCH";
  if (/Disclosed fields do not match/i.test(message))
    return "PREDICATE_MISMATCH";
  if (/holder/i.test(message)) return "HOLDER_BINDING_FAILED";
  if (/signature/i.test(message)) return "INVALID_SIGNATURE";
  return "PROOF_INVALID";
}

// ---------------------------------------------------------------------------
// VerificationService
// ---------------------------------------------------------------------------

export class VerificationService {
  // ─── API-030 POST /sessions (Service Provider, API key) ─────────────────

  /**
   * FR-043 — the Service Provider's server opens a session for one predicate.
   * The backend generates the session ID and a single-use nonce; the SP embeds
   * both in its page for the extension to detect (FR-032).
   */
  async createSession(
    params: CreateSessionParams,
  ): Promise<CreateSessionResult> {
    const { verifierId, predicate, configuredPredicates, callbackUrl } = params;

    // BR-021 / FR-005 AC2: only catalog predicates.
    if (!isPredicateCode(predicate)) {
      throw new VerificationError(
        `Unknown predicate '${predicate}'. Use a code from the predicate catalog.`,
        "UNKNOWN_PREDICATE",
        422,
      );
    }

    // FR-043 AC3: only predicates this provider configured (FR-041).
    if (!configuredPredicates.includes(predicate)) {
      throw new VerificationError(
        `Predicate '${predicate}' is not configured for this Service Provider`,
        "PREDICATE_NOT_CONFIGURED",
        403,
      );
    }

    const sessionId = uuidv4();
    const nonce = randomToken();
    const expiresAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    await prisma.$transaction([
      prisma.verificationRequest.create({
        data: {
          id: sessionId,
          verifierId,
          predicate,
          requestedFields: [predicate],
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
          metadata: { predicate },
        },
      }),
    ]);

    return {
      sessionId,
      nonce,
      predicate,
      predicateLabel: predicateLabel(predicate),
      requestedFields: [predicate],
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
      await this.expireIfDue(session);
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
    const predicate = sessionPredicate(session);

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
          requested_fields: [predicate],
          nonce: session.nonce,
          expires_at: session.expiresAt.toISOString(),
        });
        notification_sent = true;
      } catch (err) {
        console.error(
          "[VerificationService.relayRequest] FCM send failed:",
          err,
        );
      }
    }

    // 4. Audit log.
    await prisma.auditLog.create({
      data: {
        eventType: "verification_request_created",
        requestId: sessionId,
        verifierId: session.verifierId,
        metadata: {
          predicate,
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
      predicate,
      predicateLabel: predicateLabel(predicate),
      requestedFields: [predicate],
      notification_sent,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  // ─── API-031 GET /sessions/:id/outcome (Service Provider, API key) ────────

  /** FR-045 — the Service Provider's server reads the outcome of its session. */
  async getSessionOutcome(
    sessionId: string,
    verifierId: string,
  ): Promise<OutcomeResult> {
    const request = await prisma.verificationRequest.findUnique({
      where: { id: sessionId },
    });

    // A verifier may only read its own sessions. Another verifier's session
    // is reported as not found so session IDs cannot be probed (FR-045 AC4).
    if (!request || request.verifierId !== verifierId) {
      throw new VerificationError(
        "Verification session not found",
        "NOT_FOUND",
        404,
      );
    }

    return this.buildOutcome(request);
  }

  // ─── API-033 GET /request/:id (extension, poll secret) ────────────────────

  /** FR-034 — the extension polls the outcome of a request it relayed. */
  async pollForExtension(
    requestId: string,
    pollSecret: string,
  ): Promise<OutcomeResult> {
    const request = await prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });

    // A wrong secret is indistinguishable from a missing request.
    if (
      !request ||
      !request.pollSecretHash ||
      !sameSecret(request.pollSecretHash, sha256Hex(pollSecret))
    ) {
      throw new VerificationError(
        "Verification request not found",
        "NOT_FOUND",
        404,
      );
    }

    return this.buildOutcome(request);
  }

  /** The outcome of one session. Never includes claim values (FR-045 AC6). */
  private async buildOutcome(request: SessionRow): Promise<OutcomeResult> {
    let status = request.status as VerificationStatus;

    // Lazy expiry, in case the ALG-005 sweep has not run yet.
    if (status === "pending" && new Date() > request.expiresAt) {
      await this.expireIfDue(request);
      status = "expired";
    }

    const predicate = sessionPredicate(request);
    const base = {
      status,
      outcome: outcomeOf(status),
      predicate,
      predicateLabel: predicateLabel(predicate),
    };

    switch (status) {
      case "pending":
        return { ...base, expiresAt: request.expiresAt.toISOString() };

      case "rejected":
        return {
          ...base,
          decidedAt: request.rejectedAt?.toISOString(),
          rejected_at: request.rejectedAt?.toISOString(),
        };

      case "expired":
        return { ...base, decidedAt: request.expiresAt.toISOString() };

      case "completed":
      case "failed": {
        const result = await prisma.verificationResult.findUnique({
          where: { requestId: request.id },
          select: { issuer: true, verifiedAt: true },
        });
        return {
          ...base,
          issuer: result?.issuer ?? null,
          decidedAt: (result?.verifiedAt ?? request.completedAt)?.toISOString(),
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

  // ─── API-035 POST /submit-proof (device JWT) ──────────────────────────────

  /**
   * FR-044 / ALG-002 — verify a proof for a session routed to this End User.
   *
   * The session nonce is consumed (ALG-003) as soon as a proof is received,
   * before any check runs, so a session takes exactly one proof (BR-005).
   * After that the session always closes: VERIFIED if every check passes,
   * FAILED otherwise. Only outcome, condition, proof hash and issuer are
   * stored (BR-015).
   */
  async submitProof(params: SubmitProofParams): Promise<SubmitProofResult> {
    const { verification_requestId, proof, user_id } = params;

    const request = await this.loadOpenSessionForUser(
      verification_requestId,
      user_id,
    );
    const predicate = sessionPredicate(request);

    // ALG-003 — consume the nonce on receipt.
    await this.consumeNonce(request.nonce);

    const proofHash = sha256Hex(JSON.stringify(proof));
    const check = await this.runVerifyProof(request, predicate, proof, user_id);

    if (!check.ok) {
      await this.closeSession(request, {
        status: "failed",
        outcome: "FAILED",
        condition: predicate,
        issuer: check.issuer,
        proofHash,
        eventType: "proof_verification_failed",
        audit: {
          user_id,
          condition: predicate,
          reason: check.code,
          error: check.message,
        },
      });
      throw new VerificationError(check.message, check.code, 400, {
        outcome: "FAILED",
        reason: check.code,
      });
    }

    const verifiedAt = await this.closeSession(request, {
      status: "completed",
      outcome: "VERIFIED",
      condition: predicate,
      issuer: check.issuer,
      proofHash,
      eventType: "proof_verified",
      audit: { user_id, condition: predicate, issuer: check.issuer, proofHash },
    });

    return {
      status: "verified",
      outcome: "VERIFIED",
      predicate,
      issuer: check.issuer,
      verifiedAt: verifiedAt.toISOString(),
    };
  }

  /**
   * ALG-002 VerifyProof. Check order: issuer registered → issuer authorised
   * for the predicate → not revoked → signature, disclosures, KB-JWT (nonce,
   * audience, proof age ≤ 60 s), holder binding, credential expiry → the
   * disclosed claim is exactly the requested predicate and is true.
   */
  private async runVerifyProof(
    request: SessionRow,
    predicate: string,
    proof: Proof,
    user_id: string,
  ): Promise<CheckResult> {
    // 1. Issuer from the (not yet verified) SD-JWT, to find its key.
    const payload = decodeSdJwtPayload(proof.presentation.sd_jwt);
    const issuerId =
      typeof payload?.["iss"] === "string" ? (payload["iss"] as string) : "";
    if (!payload || !issuerId) {
      return {
        ok: false,
        code: "INVALID_JWT",
        message: "Malformed SD-JWT: missing or unreadable `iss`",
        issuer: null,
      };
    }

    // 2. Issuer must be in the registry and active (BR-003).
    const issuerRecord = await prisma.issuerRegistry.findUnique({
      where: { issuerId },
    });
    if (!issuerRecord || !issuerRecord.active) {
      return {
        ok: false,
        code: "UNTRUSTED_ISSUER",
        message: `Issuer '${issuerId}' is not in the trusted registry or is inactive`,
        issuer: null,
      };
    }

    // 3. Only the issuer registered for the predicate's category may vouch for it (BR-010, BR-021).
    if (
      isPredicateCode(predicate) &&
      PREDICATE_CATALOG[predicate].issuer !== issuerId
    ) {
      return {
        ok: false,
        code: "WRONG_ISSUER",
        message: `Issuer '${issuerId}' does not issue '${predicate}'`,
        issuer: issuerId,
      };
    }

    // 4. Revocation (BR-006). Postgres is the source of truth.
    const credentialJti = sdJwtCredentialId(proof.presentation.sd_jwt);
    if (credentialJti) {
      const record = await prisma.credential.findUnique({
        where: { credentialJti },
        select: { status: true },
      });
      if (record?.status === "revoked") {
        return {
          ok: false,
          code: "CREDENTIAL_REVOKED",
          message: "This credential has been revoked and cannot be used",
          issuer: issuerId,
        };
      }
    }

    // 5. Device key of the End User the session was routed to.
    const userRecord = await prisma.user.findUnique({
      where: { id: user_id },
      select: { publicKey: true },
    });
    if (!userRecord?.publicKey) {
      return {
        ok: false,
        code: "MISSING_PUBLIC_KEY",
        message: "User has no registered device key — cannot verify proof",
        issuer: issuerId,
      };
    }

    // 6. Cryptographic checks; the proof must disclose exactly the predicate.
    const result = await verifyProof(proof, {
      issuerPublicKey: issuerRecord.publicKey,
      userPublicKey: userRecord.publicKey,
      expectedNonce: request.nonce,
      verifierId: request.verifierId ?? "",
      expectedFields: [predicate],
    });
    if (!result.valid) {
      const message = result.error ?? "Proof verification failed";
      return {
        ok: false,
        code: classifyProofError(message),
        message,
        issuer: issuerId,
      };
    }

    // 7. The issuer-signed predicate must hold.
    if (result.verifiedFields[predicate] !== true) {
      return {
        ok: false,
        code: "CONDITION_NOT_MET",
        message: `The credential does not confirm '${predicate}'`,
        issuer: issuerId,
      };
    }

    return { ok: true, issuer: result.issuer };
  }

  // ─── API-036 POST /reject/:id (device JWT) ────────────────────────────────

  /** FR-023 — the End User declines. Outcome DECLINED. */
  async rejectRequest(
    requestId: string,
    user_id: string,
  ): Promise<{ status: "rejected"; outcome: "DECLINED" }> {
    const request = await this.loadOpenSessionForUser(requestId, user_id);
    await this.closeSession(request, {
      status: "rejected",
      eventType: "verification_rejected",
      audit: { user_id, condition: sessionPredicate(request) },
    });
    return { status: "rejected", outcome: "DECLINED" };
  }

  // ─── API-037 POST /fail/:id (device JWT) ──────────────────────────────────

  /**
   * FR-025 AC2 — the device found no valid credential carrying the requested
   * predicate. Outcome FAILED; no proof, so no proof hash or issuer.
   */
  async failRequest(
    requestId: string,
    user_id: string,
  ): Promise<{ status: "failed"; outcome: "FAILED" }> {
    const request = await this.loadOpenSessionForUser(requestId, user_id);
    const predicate = sessionPredicate(request);
    await this.closeSession(request, {
      status: "failed",
      outcome: "FAILED",
      condition: predicate,
      issuer: null,
      proofHash: null,
      eventType: "verification_failed_no_credential",
      audit: {
        user_id,
        condition: predicate,
        reason: "NO_MATCHING_CREDENTIAL",
      },
    });
    return { status: "failed", outcome: "FAILED" };
  }

  // ─── ALG-005 ExpireSessions ───────────────────────────────────────────────

  /**
   * Closes every PENDING session whose response window has passed (FR-024).
   * One atomic UPDATE … RETURNING, so a session answered at the same moment is
   * never overwritten. Returns the number of sessions expired.
   */
  async expireSessions(now: Date = new Date()): Promise<number> {
    const expired = await prisma.$queryRaw<
      { id: string; verifier_id: string | null; user_id: string | null }[]
    >`
      UPDATE "verification_requests"
      SET "status" = 'expired'
      WHERE "status" = 'pending' AND "expires_at" <= ${now}
      RETURNING "id", "verifier_id", "user_id"`;

    if (expired.length > 0) {
      await prisma.auditLog.createMany({
        data: expired.map((r) => ({
          eventType: "verification_expired",
          requestId: r.id,
          verifierId: r.verifier_id,
          metadata: { user_id: r.user_id, source: "ALG-005" },
        })),
      });
    }
    return expired.length;
  }

  /** Starts the ALG-005 sweep. Returns a stop function. */
  startExpirySweep(intervalMs: number = EXPIRY_SWEEP_INTERVAL_MS): () => void {
    const timer = setInterval(() => {
      this.expireSessions().catch((err) =>
        console.error("[ALG-005] expiry sweep failed:", err),
      );
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  // ─── API-034 GET /pending (device JWT) ────────────────────────────────────

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

    return rows.map((r) => {
      const predicate = sessionPredicate(r);
      return {
        requestId: r.id,
        verifierId: r.verifierId ?? "",
        verifierName: r.verifier?.displayName ?? "Unknown verifier",
        verifierDomain: r.verifier?.domain ?? null,
        predicate,
        predicateLabel: predicateLabel(predicate),
        requestedFields: [predicate],
        nonce: r.nonce,
        pageUrl: r.pageUrl,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      };
    });
  }

  // ─── API-038 GET /history (device JWT) ────────────────────────────────────

  async getHistory(
    user_id: string,
    page: number,
    limit: number,
  ): Promise<HistoryResult> {
    const skip = (page - 1) * limit;

    // Requests routed to this user via pairing (incl. expired ones).
    // Pending requests live on /pending.
    const where = { userId: user_id, status: { not: "pending" } };

    const [total, requests] = await Promise.all([
      prisma.verificationRequest.count({ where }),
      prisma.verificationRequest.findMany({
        where,
        include: {
          result: { select: { issuer: true, verifiedAt: true } },
          verifier: { select: { displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const data: HistoryRecord[] = requests.map((r) => {
      const predicate = sessionPredicate(r);
      return {
        requestId: r.id,
        verifierId: r.verifierId ?? "",
        verifierName: r.verifier?.displayName ?? "Unknown verifier",
        predicate,
        predicateLabel: predicateLabel(predicate),
        requestedFields: [predicate],
        decidedAt: (r.completedAt ?? r.rejectedAt)?.toISOString() ?? null,
        outcome: outcomeOf(r.status),
        issuer: r.result?.issuer ?? null,
        status: r.status as VerificationStatus,
        created_at: r.createdAt.toISOString(),
      };
    });

    return { data, total, page, limit };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * A session the End User may still answer: routed to them, PENDING and
   * inside its window. Anyone else gets the same 404 as for a missing session.
   */
  private async loadOpenSessionForUser(
    id: string,
    user_id: string,
  ): Promise<SessionRow> {
    const request = await prisma.verificationRequest.findUnique({
      where: { id },
    });

    if (!request || request.userId !== user_id) {
      throw new VerificationError(
        "Verification request not found",
        "NOT_FOUND",
        404,
      );
    }

    if (request.status !== "pending") {
      throw new VerificationError(
        `This session is already closed (status: ${request.status}); its nonce cannot be used again`,
        "SESSION_CLOSED",
        400,
      );
    }

    // FR-024 AC1: after the window the request can no longer be answered.
    if (new Date() > request.expiresAt) {
      await this.expireIfDue(request);
      throw new VerificationError(
        "Verification request has expired",
        "REQUEST_EXPIRED",
        400,
      );
    }

    return request;
  }

  /** ALG-003 ConsumeNonce. The primary key on used_nonces makes it single-use. */
  private async consumeNonce(nonce: string): Promise<void> {
    try {
      await prisma.usedNonce.create({ data: { nonce } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new VerificationError(
          "Nonce already used — replayed proof rejected",
          "NONCE_REPLAYED",
          400,
        );
      }
      throw err;
    }
  }

  /** Expires one session if it is still PENDING past its window (lazy ALG-005). */
  private async expireIfDue(
    request: Pick<SessionRow, "id" | "verifierId" | "userId">,
  ): Promise<void> {
    const updated = await prisma.verificationRequest.updateMany({
      where: {
        id: request.id,
        status: "pending",
        expiresAt: { lte: new Date() },
      },
      data: { status: "expired" },
    });
    if (updated.count > 0) {
      await prisma.auditLog.create({
        data: {
          eventType: "verification_expired",
          requestId: request.id,
          verifierId: request.verifierId,
          metadata: { user_id: request.userId, source: "lazy" },
        },
      });
    }
  }

  /**
   * Closes a PENDING session with its single outcome (FR-045 AC1). The status
   * change is conditional, so a session closed concurrently (answered, or
   * expired by ALG-005) is never overwritten.
   */
  private async closeSession(
    request: SessionRow,
    close: {
      status: "completed" | "failed" | "rejected";
      outcome?: "VERIFIED" | "FAILED";
      condition?: string;
      issuer?: string | null;
      proofHash?: string | null;
      eventType: string;
      audit: Record<string, unknown>;
    },
  ): Promise<Date> {
    const at = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.verificationRequest.updateMany({
        where: { id: request.id, status: "pending" },
        data:
          close.status === "rejected"
            ? { status: "rejected", rejectedAt: at }
            : { status: close.status, completedAt: at },
      });
      if (updated.count === 0) {
        throw new VerificationError(
          "This session was closed before the answer arrived",
          "SESSION_CLOSED",
          400,
        );
      }

      // Rejecting also uses up the nonce, so the session can never take a proof.
      await tx.usedNonce.createMany({
        data: [{ nonce: request.nonce }],
        skipDuplicates: true,
      });

      if (close.outcome) {
        await tx.verificationResult.create({
          data: {
            requestId: request.id,
            outcome: close.outcome,
            condition: close.condition ?? sessionPredicate(request),
            issuer: close.issuer ?? null,
            proofHash: close.proofHash ?? null,
            verifiedAt: at,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          eventType: close.eventType,
          requestId: request.id,
          verifierId: request.verifierId,
          metadata: close.audit as Prisma.InputJsonObject,
        },
      });
    });

    return at;
  }
}

export const verificationService = new VerificationService();
