// services/backend/src/routes/qr-challenges.route.ts
//
// /api/v1/qr-challenges — single-use QR challenges (SRS IF-003: API-023,
// API-024, API-025; FR-003, FR-031; ALG-006, ALG-007).
// Logic lives in qr-challenge.service.ts.

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { ValidationError } from "../middleware/error.middleware.js";
import { success } from "../lib/response.js";
import {
  qrChallengeService,
  QR_CHALLENGE_PURPOSES,
} from "../services/qr-challenge.service.js";
import { PAIRING_TOKEN_HEADER } from "../services/pairing.service.js";

const router = Router();

const IdSchema = z.string().uuid("Invalid challenge ID");

const CreateSchema = z.object({
  purpose: z.enum(QR_CHALLENGE_PURPOSES, "purpose must be PAIRING"),
});

const RedeemSchema = z.object({
  challengeId: IdSchema,
  code: z.string().min(1, "code is required").max(256),
  signature: z.string().min(1, "signature is required").max(2048),
});

const TokenSchema = z.string().min(1, `Missing ${PAIRING_TOKEN_HEADER} header`);

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Validation failed",
    );
  }
  return parsed.data;
}

// API-023 — the extension requests a new pairing QR code (FR-031).
// Unauthenticated: the extension has no account; the returned pairing token
// is its credential from here on.
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { purpose } = parseOrThrow(CreateSchema, req.body);
      const result = await qrChallengeService.create(purpose);
      res.status(201).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

// API-025 — the signed-in device redeems a scanned code (FR-003, ALG-006/007).
// Declared before /:id so "redeem" is never read as an ID.
router.post(
  "/redeem",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parseOrThrow(RedeemSchema, req.body);
      const result = await qrChallengeService.redeem({
        ...body,
        userId: req.user!.sub,
      });
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

// API-024 — the extension polls the challenge state with its pairing token.
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseOrThrow(IdSchema, req.params.id);
      const token = parseOrThrow(
        TokenSchema,
        req.header(PAIRING_TOKEN_HEADER) ?? "",
      );
      const result = await qrChallengeService.getStatus(id, token);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
