// services/backend/src/controllers/auth.controller.ts
//
// Single source of truth for register/login. Moved out of users.route.ts
// verbatim (logic unchanged) so both /api/v1/users/* and /api/v1/auth/*
// call the exact same code — see routes/users.route.ts and routes/auth.route.ts.

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { importSPKI, SignJWT } from 'jose';
import { verify as verifySignature } from 'crypto';
import prisma from '../lib/prisma.js';
import { success, failure } from '../lib/response.js';
import { Prisma } from '@prisma/client';

// ── Helpers ──────────────────────────────────────────────────────────────────
// Duplicated (not reused) from users.route.ts: these are small, pure utility
// functions, not authentication logic. Keeping them here avoids a 5th touched
// file / circular import between users.route.ts and this controller.

const RSA_PEM_REGEX = /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/;

function isValidRSAPEM(key: string): boolean {
  return RSA_PEM_REGEX.test(key.trim());
}

async function writeAuditLog(
  event_type: string,
  metadata: Record<string, unknown>,
  request_id?: string,
  verifier_id?: string
): Promise<void> {
await prisma.auditLog.create({
   data: {
    eventType: event_type,
    requestId: request_id ?? null,
    verifierId: verifier_id ?? null,
    metadata: metadata as Prisma.InputJsonValue,
  },
});
}

/**
 * Parse a duration string like "7d", "24h", "3600s" into seconds.
 * Falls back to 7 days if the format is unrecognised.
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default:  return 7 * 24 * 60 * 60;
  }
}

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  publicKey: z
    .string()
    .min(1, 'publicKey is required')
    .refine((val) => isValidRSAPEM(val), {
      message: 'publicKey must be a valid RSA PEM (BEGIN PUBLIC KEY … END PUBLIC KEY)',
    }),
  pushToken: z.string().min(1, 'pushToken is required'),
  device_info: z.record(z.string(), z.unknown()).optional().default({}),
});

const LoginSchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  signature: z.string().min(1, 'signature is required'),
  challenge: z.string().min(1, 'challenge is required'),
});

// ── register ─────────────────────────────────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
      return;
    }

    const { user_id, publicKey, pushToken, device_info } = parsed.data;

    const user = await prisma.user.upsert({
      where: { id: user_id },
      update: {
       publicKey: publicKey,
       pushToken: pushToken,
       deviceInfo: device_info as Prisma.InputJsonValue,
       updatedAt: new Date(),
      },
      create: {
       id: user_id,
       publicKey: publicKey,
       pushToken: pushToken,
       deviceInfo: device_info as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog('user_registered', {
      user_id: user.id,
      action: 'upsert',
    });

    res.status(201).json(
      success({
        user_id: user.id,
        registered_at: user.createdAt.toISOString()
      })
    );
  } catch (err) {
    next(err);
  }
}

// ── login ────────────────────────────────────────────────────────────────────

// ── login ────────────────────────────────────────────────────────────────────

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = LoginSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
      return;
    }

    const { user_id, signature, challenge } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: user_id },
    });

    if (!user) {
      res.status(401).json(failure('User not found'));
      return;
    }

    let signatureValid = false;

    try {
      signatureValid = verifySignature(
        'RSA-SHA256',
        Buffer.from(challenge, 'utf8'),
        user.publicKey,
        Buffer.from(signature, 'base64'),
      );
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      res.status(401).json(failure('Signature verification failed'));
      return;
    }

    const rawSecret = process.env.JWT_SECRET;

    if (!rawSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const jwtSecret = new TextEncoder().encode(rawSecret);

    const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
    const expiresInSeconds = parseExpiry(expiresIn);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const token = await new SignJWT({ sub: user_id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(jwtSecret);

    await writeAuditLog('user_login', { user_id });

    res.status(200).json(
      success({
        token,
        expires_at: expiresAt.toISOString(),
      }),
    );
  } catch (err) {
    next(err);
  }
}