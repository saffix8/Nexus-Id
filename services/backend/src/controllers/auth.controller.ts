// services/backend/src/controllers/auth.controller.ts
//
// Single source of truth for MOBILE register/login (RSA-challenge flow).
// Used by routes/users.route.ts. Do NOT confuse with web-auth.controller.ts,
// which handles the separate email/password flow for the web dashboard.

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { createVerify } from 'crypto';
import prisma from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { success, failure } from '../lib/response.js';
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

const RegisterSchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  public_key: z
    .string()
    .min(1, 'public_key is required')
    .refine((val) => isValidRSAPEM(val), {
      message: 'public_key must be a valid RSA PEM (BEGIN PUBLIC KEY … END PUBLIC KEY)',
    }),
  push_token: z.string().min(1, 'push_token is required'),
  device_info: z.record(z.string(), z.unknown()).optional().default({}),
});

const LoginSchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  signature: z.string().min(1, 'signature is required'),
  challenge: z.string().min(1, 'challenge is required'),
});

// ── register (mobile RSA-key registration) ────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
      return;
    }

    const { user_id, public_key, push_token, device_info } = parsed.data;

    const user = await prisma.user.upsert({
      where: { id: user_id },
      update: {
        publicKey: public_key,
        pushToken: push_token,
        deviceInfo: device_info as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
      create: {
        id: user_id,
        publicKey: public_key,
        pushToken: push_token,
        deviceInfo: device_info as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog('user_registered', { user_id: user.id, action: 'upsert' });

    res.status(201).json(
      success({ user_id: user.id, registered_at: user.createdAt.toISOString() })
    );
  } catch (err) {
    next(err);
  }
}

// ── login (mobile RSA-signature-over-challenge) ───────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
      return;
    }

    const { user_id, signature, challenge } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: user_id } });
    if (!user || !user.publicKey) {
      res.status(401).json(failure('User not found'));
      return;
    }

    let signatureValid = false;
    try {
      const verifier = createVerify('SHA256');
      verifier.update(challenge);
      signatureValid = verifier.verify(user.publicKey, signature, 'base64');
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      res.status(401).json(failure('Signature verification failed'));
      return;
    }

    const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
    const expiresInSeconds = parseExpiry(process.env.JWT_EXPIRES_IN ?? '7d');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const token = await new SignJWT({ sub: user_id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(jwtSecret);

    await writeAuditLog('user_login', { user_id });

    res.status(200).json(success({ token, expires_at: expiresAt.toISOString() }));
  } catch (err) {
    next(err);
  }
}