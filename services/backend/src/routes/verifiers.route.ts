// services/backend/src/routes/verification.route.ts

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { success, failure } from '../lib/response.js';
import crypto from 'crypto';

const router = Router();

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const CreateRequestSchema = z.object({
  verifier_id: z.string().min(1, 'verifier_id is required'),
  verifier_name: z.string().min(1, 'verifier_name is required'),
  requested_fields: z.array(z.string()).min(1, 'At least one field must be requested'),
  nonce: z.string().min(1, 'nonce is required'),
  page_url: z.string().url('page_url must be a valid URL'),
  callback_url: z.string().url('callback_url must be a valid URL').optional(),
});

const SubmitProofSchema = z.object({
  verification_request_id: z.string().min(1, 'verification_request_id is required'),
  proof: z.object({
    presentation: z.object({
      sd_jwt: z.string().min(1),
      disclosures: z.array(z.string()),
    }),
    key_binding: z.string().min(1),
    timestamp: z.string().min(1),
    verifier_id: z.string().min(1),
  }),
});



// ── POST /api/v1/verification/request ─────────────────────────────────────────

router.post(
  '/request',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(failure(parsed.error.issues[0]?.message ?? 'Validation failed'));
        return;
      }

      const { verifier_id, requested_fields, nonce, page_url, callback_url } = parsed.data;
      const sessionId = crypto.randomUUID();

      const verificationRequest = await prisma.verificationRequest.create({
        data: {
          id: sessionId,
          verifierId: verifier_id,
          requestedFields: requested_fields,
          nonce,
          pageUrl: page_url,
          callbackUrl: callback_url ?? null,
          status: 'pending',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins expiry
        },
      });

      res.status(201).json(
        success({
          sessionId: verificationRequest.id,
          status: verificationRequest.status,
          qrPayload: JSON.stringify({
            sessionId: verificationRequest.id,
            callbackUrl: verificationRequest.callbackUrl ?? `http://localhost:4000/api/v1/verification/submit-proof`,
            requestedFields: requested_fields,
            nonce,
          }),
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/v1/verification/submit-proof ────────────────────────────────────

router.post(
  '/submit-proof',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = SubmitProofSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(failure(parsed.error.issues[0]?.message ?? 'Validation failed'));
        return;
      }

      const { verification_request_id } = parsed.data;

      const requestRecord = await prisma.verificationRequest.findUnique({
        where: { id: verification_request_id },
      });

      if (!requestRecord) {
        res.status(404).json(failure('Verification session not found'));
        return;
      }

      if (requestRecord.status !== 'pending') {
        res.status(400).json(failure('Verification session is already completed or expired'));
        return;
      }

      const updatedRequest = await prisma.verificationRequest.update({
        where: { id: verification_request_id },
        data: {
          status: 'verified',
          completedAt: new Date(),
        },
      });

      res.status(200).json(
        success({
          sessionId: updatedRequest.id,
          status: updatedRequest.status,
          message: 'Proof submitted and verified successfully',
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/v1/verification/session/:id ──────────────────────────────────────

router.get(
  '/session/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);

      const requestRecord = await prisma.verificationRequest.findUnique({
        where: { id },
      });

      if (!requestRecord) {
        res.status(404).json(failure('Verification session not found'));
        return;
      }

      res.status(200).json(
        success({
          sessionId: requestRecord.id,
          status: requestRecord.status,
          requestedFields: requestRecord.requestedFields,
          createdAt: requestRecord.createdAt,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;