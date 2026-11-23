// services/backend/src/routes/pairing.route.ts
//
// /api/v1/pairing — browser extension <-> mobile device pairing
// (SRS UC-002, FR-003, FR-024). Logic lives in pairing.service.ts.

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
  pairingService,
  PAIRING_SECRET_HEADER,
} from "../services/pairing.service.js";

const router = Router();

const IdSchema = z.string().uuid("Invalid pairing ID");

const ClaimSchema = z.object({
  pairingId: IdSchema,
  code: z.string().min(1, "code is required").max(256),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Validation failed",
    );
  }
  return parsed.data;
}

// POST /pairing/sessions — extension requests a new pairing QR code.
// Unauthenticated: the extension has no account; the returned secret is its
// credential for this pairing from here on.
router.post(
  "/sessions",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pairingService.createSession();
      res.status(201).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

// GET /pairing/sessions/:id — extension polls for the pairing outcome.
router.get(
  "/sessions/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseOrThrow(IdSchema, req.params.id);
      const secret = parseOrThrow(
        z.string().min(1, `Missing ${PAIRING_SECRET_HEADER} header`),
        req.header(PAIRING_SECRET_HEADER) ?? "",
      );
      const result = await pairingService.getSessionState(id, secret);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

// POST /pairing/claim — signed-in mobile app claims a scanned QR code.
router.post(
  "/claim",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { pairingId, code } = parseOrThrow(ClaimSchema, req.body);
      const result = await pairingService.claim(pairingId, code, req.user!.sub);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

// GET /pairing/devices — the signed-in End User's paired browsers (FR-032).
router.get(
  "/devices",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pairingService.listForUser(req.user!.sub);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /pairing/devices/:id — revoke a paired browser (FR-032).
router.delete(
  "/devices/:id",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseOrThrow(IdSchema, req.params.id);
      await pairingService.revoke(id, req.user!.sub);
      res.status(200).json(success(null));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
