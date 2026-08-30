// services/backend/src/controllers/web-auth.controller.ts
//
// Email/password auth for the web dashboard — separate from the mobile
// RSA-challenge flow in auth.controller.ts. Mobile signs proofs with a
// hardware-backed key; web users manage credentials/QR codes and don't
// need that trust model, so a conventional password login is used here.

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import prisma from '../lib/prisma.js';
import type { Prisma } from '@prisma/client'
import { success, failure } from '../lib/response.js';

const BCRYPT_ROUNDS = 12;

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

async function writeAuditLog(event_type: string, metadata: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({
    data: { eventType: event_type, metadata: metadata as Prisma.InputJsonValue },
  });
}

const WebRegisterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const WebLoginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

async function issueToken(user: { id: string; email: string | null; name: string | null }) {
  const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
  const expiresInSeconds = parseExpiry(process.env.JWT_EXPIRES_IN ?? '7d');
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const token = await new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(jwtSecret);

  return { token, expiresAt };
}

// ── register ─────────────────────────────────────────────────────────────────

export async function webRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = WebRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
      return;
    }

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json(failure('An account with this email already exists'));
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: { email, name, passwordHash },
    });

    await writeAuditLog('web_user_registered', { user_id: user.id });

    const { token, expiresAt } = await issueToken(user);

    res.status(201).json(success({ token, expires_at: expiresAt.toISOString() }));
  } catch (err) {
    next(err);
  }
}

// ── login ────────────────────────────────────────────────────────────────────

export async function webLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = WebLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
      return;
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      res.status(401).json(failure('Invalid email or password'));
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json(failure('Invalid email or password'));
      return;
    }

    await writeAuditLog('web_user_login', { user_id: user.id });

    const { token, expiresAt } = await issueToken(user);

    res.status(200).json(success({ token, expires_at: expiresAt.toISOString() }));
  } catch (err) {
    next(err);
  }
}