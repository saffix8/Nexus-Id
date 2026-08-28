import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { verifyProof } from '@nexusid/sd-jwt';
import prisma from '../lib/prisma.js';
import { notificationService } from './notification.service.js';
import type { Proof, VerificationStatus } from '@nexusid/types';

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
    this.name = 'VerificationError';
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface CreateRequestParams {
  verifierId: string;
  verifierName: string;
  requestedFields: string[];
  nonce: string;
  callbackUrl?: string;
  pageUrl: string;
}

export interface CreateRequestResult {
  requestId: string;
  status: 'queued';
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
  status: 'verified';
  verifiedFields: Record<string, unknown>;
  issuer: string;
  verifiedAt: string;
}

export interface HistoryRecord {
  requestId: string;
  verifierId: string;
  verifiedFields: Record<string, unknown> | null;
  verifiedAt: string | null;
  status: VerificationStatus;
  created_at: string;
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

const EXPIRY_MINUTES = 5;

function buildExpiresAt(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + EXPIRY_MINUTES);
  return d;
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Extract the `iss` claim from a compact JWT (or the JWT part of an SD-JWT)
 * WITHOUT verifying the signature.
 *
 * This is only used to locate the issuer's public key.
 * Full cryptographic verification happens later in verifyProof().
 */
function extractIssuerFromSDJWT(sdJwt: string): string {
  // SD-JWT:
  // <header>.<payload>.<signature>~<disclosure>~...
  const jwtPart = sdJwt.split('~')[0];
  const segments = jwtPart.split('.');

  if (segments.length < 3) {
    throw new VerificationError(
      'Malformed SD-JWT: expected three dot-separated segments',
      'INVALID_JWT',
    );
  }

  const payloadB64 = segments[1];

  // base64url -> base64
  const padded = payloadB64
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padding = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padding);

  const json = Buffer.from(b64, 'base64').toString('utf8');

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new VerificationError(
      'SD-JWT payload is not valid JSON',
      'INVALID_JWT',
    );
  }

  if (typeof payload['iss'] !== 'string' || !payload['iss']) {
    throw new VerificationError(
      'SD-JWT missing required `iss` claim',
      'INVALID_JWT',
    );
  }

  return payload['iss'];
}

// ---------------------------------------------------------------------------
// VerificationService
// ---------------------------------------------------------------------------

export class VerificationService {

  // ─── POST /request ────────────────────────────────────────────────────────

  async createRequest(
    params: CreateRequestParams,
  ): Promise<CreateRequestResult> {
    const {
      verifierId,
      verifierName,
      requestedFields,
      nonce,
      callbackUrl,
      pageUrl,
    } = params;

    // 1. Replay-attack guard — nonce must never have been used.
    const usedNonce = await prisma.usedNonce.findUnique({
      where: { nonce },
    });

    if (usedNonce) {
      throw new VerificationError(
        'Nonce has already been consumed',
        'NONCE_REPLAY',
        400,
      );
    }

    // Also reject if a live request already holds this nonce.
    const liveRequest = await prisma.verificationRequest.findFirst({
      where: {
        nonce,
        status: {
          in: ['pending', 'completed'],
        },
      },
    });

    if (liveRequest) {
      throw new VerificationError(
        'A live request with this nonce already exists',
        'NONCE_IN_USE',
        400,
      );
    }

    // 2. Persist the verification request.
    const requestId = uuidv4();
    const expiresAt = buildExpiresAt();

    await prisma.verificationRequest.create({
      data: {
        id: requestId,
        verifierId,
        requestedFields,
        nonce,
        callbackUrl: callbackUrl ?? null,
        pageUrl,
        status: 'pending',
        expiresAt,
      },
    });

        // 3. Collect all users with a registered push token.
    const users = await prisma.user.findMany({
      where: {
        pushToken: {
          not: null,
        },
      },
      select: {
        pushToken: true,
      },
    });

    const pushTokens = users
      .map((user) => user.pushToken)
      .filter((token): token is string => Boolean(token));

      // 4. Dispatch FCM notifications.
    // A notification failure must never fail verification-request creation.
    let notification_sent = false;

    for (const pushToken of pushTokens) {
      try {
        await notificationService.sendVerificationRequest({
          push_token: pushToken,
          verification_request_id: requestId,
          verifier_id: verifierId,
          verifier_name: verifierName,
          requested_fields: requestedFields,
          nonce,
          expires_at: expiresAt.toISOString(),
        });

        notification_sent = true;
      } catch (err) {
        console.error(
          '[VerificationService.createRequest] FCM send failed:',
          err,
        );
      }
    }

    // 5. Audit log.
    await prisma.auditLog.create({
      data: {
        eventType: 'verification_request_created',
        requestId,
        verifierId,
        metadata: {
          requestedFields,
          pageUrl,
          notification_sent,
          users_notified: pushTokens.length,
        },
      },
    });

    return {
      requestId,
      status: 'queued',
      notification_sent,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ─── GET /request/:id ─────────────────────────────────────────────────────

  async pollRequest(requestId: string): Promise<PollResult> {
    const request = await prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new VerificationError(
        'Verification request not found',
        'NOT_FOUND',
        404,
      );
    }

    // Lazily expire stale pending requests on first poll.
    if (
      request.status === 'pending' &&
      new Date() > request.expiresAt
    ) {
      await prisma.verificationRequest.update({
        where: { id: requestId },
        data: { status: 'expired' },
      });

      return {
        status: 'expired',
      };
    }

    const status = request.status as VerificationStatus;

    switch (status) {
      case 'pending':
        return {
          status: 'pending',
          expiresAt: request.expiresAt.toISOString(),
        };

      case 'rejected':
        return {
          status: 'rejected',
          rejected_at: request.rejectedAt?.toISOString(),
        };

      case 'expired':
        return {
          status: 'expired',
        };

      case 'completed': {
        const result =
          await prisma.verificationResult.findUnique({
            where: { requestId },
          });

        return {
          status: 'completed',
          verifiedFields:
            (result?.verifiedFields as Record<string, unknown>) ?? {},
          callbackUrl:
            request.callbackUrl ?? undefined,
        };
      }

      default:
        throw new VerificationError(
          `Unexpected request status: ${status}`,
          'INTERNAL_ERROR',
          500,
        );
    }
  }

  // ─── POST /submit-proof ───────────────────────────────────────────────────

  async submitProof(
    params: SubmitProofParams,
  ): Promise<SubmitProofResult> {
    const {
      verification_requestId,
      proof,
      user_id,
    } = params;

    // 1. Load and validate the request.
    const request =
      await prisma.verificationRequest.findUnique({
        where: {
          id: verification_requestId,
        },
      });

    if (!request) {
      throw new VerificationError(
        'Verification request not found',
        'NOT_FOUND',
        404,
      );
    }

    if (request.status !== 'pending') {
      throw new VerificationError(
        `Request is not pending (status: ${request.status})`,
        'INVALID_STATUS',
        400,
      );
    }

    if (new Date() > request.expiresAt) {
      await prisma.verificationRequest.update({
        where: {
          id: verification_requestId,
        },
        data: {
          status: 'expired',
        },
      });

      throw new VerificationError(
        'Verification request has expired',
        'REQUEST_EXPIRED',
        400,
      );
    }

    // 2. Resolve issuer public key from the SD-JWT.
    const issuerId = extractIssuerFromSDJWT(
      proof.presentation.sd_jwt,
    );

    const issuerRecord =
      await prisma.issuerRegistry.findUnique({
        where: {
          issuerId,
        },
      });

    if (!issuerRecord || !issuerRecord.active) {
      throw new VerificationError(
        `Issuer '${issuerId}' is not in the trusted registry or is inactive`,
        'UNTRUSTED_ISSUER',
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
      throw new VerificationError(
        'User not found',
        'USER_NOT_FOUND',
        404,
      );
    }

    // 4. Full cryptographic proof verification.
    const verifyResult = await verifyProof(proof, {
      issuerPublicKey: issuerRecord.publicKey,
      userPublicKey: userRecord.publicKey,
      expectedNonce: request.nonce,
      verifierId: request.verifierId ?? '',
    });

    if (!verifyResult.valid) {
      // Record failed verification for audit/fraud analysis.
      await prisma.auditLog.create({
        data: {
          eventType: 'proof_verification_failed',
          requestId: verification_requestId,
          verifierId: request.verifierId,
          metadata: {
            error: verifyResult.error ?? 'unknown',
            user_id,
          },
        },
      });

      throw new VerificationError(
        verifyResult.error ?? 'Proof verification failed',
        'PROOF_INVALID',
        400,
      );
    }

    // 5. Commit result atomically.
    const verifiedAt = new Date();
    const proofHash = sha256Hex(
      JSON.stringify(proof),
    );

    await prisma.$transaction([
      // Store verified fields.
      prisma.verificationResult.create({
        data: {
          id: uuidv4(),
          requestId: verification_requestId,
          verifiedFields:
            verifyResult.verifiedFields as object,
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
          status: 'completed',
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
          eventType: 'proof_verified',
          requestId: verification_requestId,
          verifierId: request.verifierId,
          metadata: {
            user_id,
            issuer: verifyResult.issuer,
            proofHash,
            fields_disclosed:
              Object.keys(
                verifyResult.verifiedFields,
              ),
          },
        },
      }),
    ]);

    return {
      status: 'verified',
      verifiedFields: verifyResult.verifiedFields,
      issuer: verifyResult.issuer,
      verifiedAt: verifiedAt.toISOString(),
    };
  }

  // ─── POST /reject/:id ─────────────────────────────────────────────────────

  async rejectRequest(
    requestId: string,
    user_id: string,
  ): Promise<{ status: 'rejected' }> {
    const request =
      await prisma.verificationRequest.findUnique({
        where: {
          id: requestId,
        },
      });

    if (!request) {
      throw new VerificationError(
        'Verification request not found',
        'NOT_FOUND',
        404,
      );
    }

    if (request.status !== 'pending') {
      throw new VerificationError(
        `Cannot reject a request with status '${request.status}'`,
        'INVALID_STATUS',
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
          status: 'rejected',
          rejectedAt,
        },
      }),

      prisma.auditLog.create({
        data: {
          eventType: 'verification_rejected',
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
      status: 'rejected',
    };
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
          in: [
            'proof_verified',
            'verification_rejected',
          ],
        },
        metadata: {
          path: ['user_id'],
          equals: user_id,
        },
      },
      select: {
        requestId: true,
      },
      distinct: ['requestId'],
    });

    const requestIds = actedLogs
      .map((log) => log.requestId)
      .filter(
        (id): id is string => id !== null,
      );

    if (requestIds.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        limit,
      };
    }

    const [total, requests] =
      await Promise.all([
        prisma.verificationRequest.count({
          where: {
            id: {
              in: requestIds,
            },
          },
        }),

        prisma.verificationRequest.findMany({
          where: {
            id: {
              in: requestIds,
            },
          },
          include: {
            result: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
      ]);

    const data: HistoryRecord[] =
      requests.map((r) => ({
        requestId: r.id,
        verifierId: r.verifierId ?? '',
        verifiedFields: r.result
          ? (r.result.verifiedFields as Record<
              string,
              unknown
            >)
          : null,
        verifiedAt:
          r.result?.verifiedAt.toISOString() ?? null,
        status:
          r.status as VerificationStatus,
        created_at:
          r.createdAt.toISOString(),
      }));

    return {
      data,
      total,
      page,
      limit,
    };
  }
}

export const verificationService =
  new VerificationService();