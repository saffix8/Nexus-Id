// services/backend/src/services/verifier-account.service.ts
//
// Service Provider accounts (SRS UC-008/UC-009, FR-033, FR-034, BR-008, BR-009).
// A separate flow from End User auth (web-auth.controller.ts / auth.controller.ts):
// providers log in with email + password and get a token with role "verifier".
//
// API keys: generated here, shown to the provider exactly once, and stored only
// as a SHA-256 hash. Rotation replaces the hash, so the previous key stops
// working immediately (BR-009).

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { VERIFIER_ROLE } from "../middleware/auth.middleware.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
} from "../middleware/error.middleware.js";

const BCRYPT_ROUNDS = 12;
const API_KEY_PREFIX = "nxk_";
const DISPLAY_PREFIX_LENGTH = 8;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** SHA-256 hex of an API key — the only form stored or looked up. */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function newApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("base64url");
}

export interface VerifierProfile {
  id: string;
  displayName: string;
  domain: string;
  email: string | null;
  apiKeyPrefix: string | null;
  apiKeyRotatedAt: string | null;
  createdAt: string;
}

export interface VerifierSession {
  token: string;
  expiresAt: string;
  verifier: VerifierProfile;
}

export interface IssuedApiKey {
  /** Plaintext key — returned once; it cannot be retrieved again. */
  apiKey: string;
  apiKeyPrefix: string;
  apiKeyRotatedAt: string;
}

export interface VerifierRequestRow {
  id: string;
  requestedFields: string[];
  status: "pending" | "completed" | "rejected" | "expired";
  /** Seconds from request to the user's decision; null while undecided. */
  responseTimeSec: number | null;
  createdAt: string;
}

type VerifierRow = Prisma.VerifierGetPayload<Record<string, never>>;

function toProfile(v: VerifierRow): VerifierProfile {
  return {
    id: v.id,
    displayName: v.displayName,
    domain: v.domain,
    email: v.email,
    apiKeyPrefix: v.apiKeyPrefix,
    apiKeyRotatedAt: v.apiKeyRotatedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

async function issueToken(v: VerifierRow): Promise<VerifierSession> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError("JWT_SECRET is not configured", 500, false);

  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    role: VERIFIER_ROLE,
    email: v.email,
    name: v.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(v.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));

  return { token, expiresAt: expiresAt.toISOString(), verifier: toProfile(v) };
}

class VerifierAccountService {
  /** UC-008 / FR-033 — register a Service Provider; issues its first API key. */
  async register(params: {
    email: string;
    password: string;
    displayName: string;
    domain: string;
  }): Promise<VerifierSession & { apiKey: string }> {
    const email = params.email.toLowerCase();
    const domain = params.domain.toLowerCase();

    const existing = await prisma.verifier.findFirst({
      where: { OR: [{ email }, { domain }] },
      select: { email: true },
    });
    if (existing) {
      // BR-008 — unique email; domains are unique per verifier too.
      throw new ConflictError(
        existing.email === email
          ? "An account with this email already exists"
          : "This domain is already registered",
      );
    }

    const apiKey = newApiKey();
    const verifier = await prisma.$transaction(async (tx) => {
      const created = await tx.verifier.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(params.password, BCRYPT_ROUNDS),
          displayName: params.displayName,
          domain,
          apiKey: hashApiKey(apiKey),
          apiKeyPrefix: apiKey.slice(0, DISPLAY_PREFIX_LENGTH),
          apiKeyRotatedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          eventType: "verifier_registered",
          verifierId: created.id,
          metadata: { domain },
        },
      });
      return created;
    });

    return { ...(await issueToken(verifier)), apiKey };
  }

  /** FR-033 — email + password login. */
  async login(emailInput: string, password: string): Promise<VerifierSession> {
    const verifier = await prisma.verifier.findUnique({
      where: { email: emailInput.toLowerCase() },
    });

    const valid =
      verifier?.passwordHash !== undefined &&
      verifier?.passwordHash !== null &&
      (await bcrypt.compare(password, verifier.passwordHash));

    if (!verifier || !valid) {
      throw new AppError("Invalid email or password", 401);
    }

    return issueToken(verifier);
  }

  async getProfile(verifierId: string): Promise<VerifierProfile> {
    const verifier = await prisma.verifier.findUnique({
      where: { id: verifierId },
    });
    if (!verifier) throw new NotFoundError("Service Provider");
    return toProfile(verifier);
  }

  /**
   * UC-009 / FR-034 — generate a new API key. The previous key is replaced in
   * the same write, so it is invalid immediately (BR-009).
   */
  async rotateApiKey(verifierId: string): Promise<IssuedApiKey> {
    const apiKey = newApiKey();
    const rotatedAt = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.verifier.updateMany({
        where: { id: verifierId },
        data: {
          apiKey: hashApiKey(apiKey),
          apiKeyPrefix: apiKey.slice(0, DISPLAY_PREFIX_LENGTH),
          apiKeyRotatedAt: rotatedAt,
        },
      });
      if (updated.count === 0) throw new NotFoundError("Service Provider");

      await tx.auditLog.create({
        data: {
          eventType: "verifier_api_key_rotated",
          verifierId,
          metadata: {},
        },
      });
    });

    return {
      apiKey,
      apiKeyPrefix: apiKey.slice(0, DISPLAY_PREFIX_LENGTH),
      apiKeyRotatedAt: rotatedAt.toISOString(),
    };
  }

  /** Verification log for the provider portal (UC-010 monitoring). */
  async listRequests(
    verifierId: string,
    from: Date,
    to: Date,
  ): Promise<VerifierRequestRow[]> {
    const rows = await prisma.verificationRequest.findMany({
      where: { verifierId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const now = new Date();
    return rows.map((r) => {
      const decidedAt = r.completedAt ?? r.rejectedAt;
      // A pending request past its window is expired even if nobody polled it.
      const status =
        r.status === "pending" && r.expiresAt < now
          ? "expired"
          : (r.status as VerifierRequestRow["status"]);
      return {
        id: r.id,
        requestedFields: r.requestedFields,
        status,
        responseTimeSec: decidedAt
          ? Math.round((decidedAt.getTime() - r.createdAt.getTime()) / 100) / 10
          : null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }
}

export const verifierAccountService = new VerifierAccountService();
