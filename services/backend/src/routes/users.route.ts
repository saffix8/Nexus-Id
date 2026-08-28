// services/backend/src/routes/users.route.ts

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { success, failure } from '../lib/response.js';
import { register, login } from '../controllers/auth.controller.js';
import { Prisma } from '@prisma/client';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

const RSA_PEM_REGEX = /^-----BEGIN PUBLIC KEY-----\s*[\s\S]+?\s*-----END PUBLIC KEY-----\s*$/;

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

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const UpdatePushTokenSchema = z.object({
  push_token: z.string().min(1, 'push_token is required'),
});

const UpdatePublicKeySchema = z.object({
  public_key: z
    .string()
    .min(1, 'public_key is required')
    .refine((val) => isValidRSAPEM(val), {
      message: 'public_key must be a valid RSA PEM (BEGIN PUBLIC KEY … END PUBLIC KEY)',
    }),
});

// ── POST /register, POST /login ──────────────────────────────────────────────

router.post('/register', register);
router.post('/login', login);

// ── PUT /:id/push-token ───────────────────────────────────────────────────────

router.put(
  '/:id/push-token',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);

      const parsed = UpdatePushTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
        return;
      }

      const { push_token } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json(failure('User not found'));
        return;
      }

      await prisma.user.update({
        where: { id },
        data: {
          pushToken: push_token,
          updatedAt: new Date(),
        },
      });

      await writeAuditLog('push_token_updated', { user_id: id });

      res.status(200).json(success(null));
    } catch (err) {
      next(err);
    }
  }
);

// ── PUT /:id/public-key ───────────────────────────────────────────────────────

router.put(
  '/:id/public-key',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);

      const parsed = UpdatePublicKeySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(failure(parsed.error.issues.map((e) => e.message).join('; ')));
        return;
      }

      const { public_key } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json(failure('User not found'));
        return;
      }

      await prisma.user.update({
        where: { id },
        data: {
          publicKey: public_key,
          updatedAt: new Date(),
        },
      });

      await writeAuditLog('public_key_updated', { user_id: id });

      res.status(200).json(success(null));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /:id/profile ──────────────────────────────────────────────────────────

router.get(
  '/:id/profile',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          publicKey: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        res.status(404).json(failure('User not found'));
        return;
      }

      res.status(200).json(success(user));
    } catch (err) {
      next(err);
    }
  }
);

export default router;