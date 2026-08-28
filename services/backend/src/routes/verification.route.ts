import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { verificationService, VerificationError } from '../services/verification.service.js';
import { success, failure } from '../lib/response.js';
import type { Proof } from '@nexusid/types';

const router = Router();

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

const CreateRequestSchema = z.object({
  verifierId: z
    .string()
    .min(1, 'verifierId is required')
    .max(255),
  verifierName: z
    .string()
    .min(1, 'verifierName is required')
    .max(255),
  requestedFields: z
    .array(z.string().min(1))
    .min(1, 'At least one field must be requested')
    .max(20, 'Too many requested fields'),
  nonce: z
    .string()
    .min(8, 'nonce must be at least 8 characters')
    .max(512),
  callbackUrl: z
    .string()
    .url('callbackUrl must be a valid URL')
    .optional(),
  pageUrl: z
    .string()
    .min(1, 'pageUrl is required')
    .max(2048),
});

const SubmitProofSchema = z.object({
  verification_requestId: z
    .string()
    .uuid('verification_requestId must be a UUID'),
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

const HistoryQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

// ---------------------------------------------------------------------------
// Error handler — converts VerificationError to HTTP responses consistently
// ---------------------------------------------------------------------------

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof VerificationError) {
    res.status(err.statusCode).json(failure(err.message));
    return;
  }
  // Re-throw unknown errors to the global error middleware
  throw err;
}

// ---------------------------------------------------------------------------
// POST /api/v1/verification/request
// Called by the browser extension when it detects a nexusid-verify element.
// ---------------------------------------------------------------------------

router.post(
  '/request',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(failure(parsed.error.issues[0]?.message ?? 'Validation failed'));
        return;
      }

      const result = await verificationService.createRequest(parsed.data);
      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/verification/request/:id
// Polled by the browser extension every 5 seconds.
// No auth required — requestId is the only secret needed here.
// ---------------------------------------------------------------------------

router.get(
  '/request/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (typeof id !== 'string' || !z.string().uuid().safeParse(id).success) {
        res.status(400).json(failure('Invalid verification request ID'));
        return;
      }

      const result = await verificationService.pollRequest(id);

      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/verification/submit-proof
// Called by the mobile app after the user approves a verification request.
// Requires a valid user JWT (issued at login via POST /auth/login).
// ---------------------------------------------------------------------------

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

      const user_id = req.user?.sub;
      if (!user_id) {
        // Should be impossible if verifyJWT ran — defensive guard
        res.status(401).json(failure('User identity missing from token'));
        return;
      }

      const result = await verificationService.submitProof({
        verification_requestId: parsed.data.verification_requestId,
        proof: parsed.data.proof as Proof,
        user_id,
      });

      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/verification/reject/:id
// Called by the mobile app when the user taps "Reject".
// ---------------------------------------------------------------------------

router.post(
  '/reject/:id',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        res.status(400).json(failure('Request ID is required'));
        return;
      }

      const user_id = req.user?.sub;
      if (!user_id) {
        res.status(401).json(failure('User identity missing from token'));
        return;
      }

      const result = await verificationService.rejectRequest(id, user_id);
      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/verification/history
// Returns this user's paginated verification history.
// ---------------------------------------------------------------------------

router.get(
  '/history',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = HistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(422).json(failure(parsed.error.issues[0]?.message ?? 'Invalid query params'));
        return;
      }

      const user_id = req.user?.sub;
      if (!user_id) {
        res.status(401).json(failure('User identity missing from token'));
        return;
      }

      const { page, limit } = parsed.data;
      const result = await verificationService.getHistory(user_id, page, limit);

      res.status(200).json({
        success: true,
        data: result.data,
        page: result.page,
        limit: result.limit,
        total: result.total,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

export default router;
