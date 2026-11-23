// services/backend/src/routes/pairings.route.ts
//
// /api/v1/pairings — the End User's paired browsers (SRS IF-003: API-026,
// API-027; FR-038). Pairings are created via /qr-challenges/redeem.

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
import { pairingService } from "../services/pairing.service.js";

const router = Router();

const IdSchema = z.string().uuid("Invalid pairing ID");

// API-026 — list the signed-in End User's pairings.
router.get(
  "/",
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

// API-027 — revoke a pairing.
router.delete(
  "/:id",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = IdSchema.safeParse(req.params.id);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? "Invalid pairing ID",
        );
      }
      await pairingService.revoke(parsed.data, req.user!.sub);
      res.status(200).json(success(null));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
