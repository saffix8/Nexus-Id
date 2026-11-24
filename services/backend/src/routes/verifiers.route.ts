// services/backend/src/routes/verifiers.route.ts
//
// /api/v1/verifiers — Service Provider accounts (SRS FR-033, FR-034).
// Logic lives in verifier-account.service.ts.

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { requireVerifierJWT } from "../middleware/auth.middleware.js";
import { ValidationError } from "../middleware/error.middleware.js";
import { success } from "../lib/response.js";
import { verifierAccountService } from "../services/verifier-account.service.js";

const router = Router();

const RegisterSchema = z.object({
  email: z.string({ error: "Email is required" }).email("Enter a valid email address"),
  password: z.string({ error: "Password is required" }).min(8, "Password must be at least 8 characters"),
  displayName: z.string({ error: "Organisation name is required" }).min(1, "Organisation name is required").max(120),
  domain: z
    .string({ error: "Domain is required" })
    .min(3, "Domain is required")
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a domain like example.com"),
});

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const RangeSchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
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

// POST /verifiers/register — UC-008. Returns a session and the first API key.
router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parseOrThrow(RegisterSchema, req.body);
      res
        .status(201)
        .json(success(await verifierAccountService.register(body)));
    } catch (err) {
      next(err);
    }
  },
);

// POST /verifiers/login — FR-033.
router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = parseOrThrow(LoginSchema, req.body);
      res
        .status(200)
        .json(success(await verifierAccountService.login(email, password)));
    } catch (err) {
      next(err);
    }
  },
);

// GET /verifiers/me — profile (never the API key itself).
router.get(
  "/me",
  requireVerifierJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res
        .status(200)
        .json(success(await verifierAccountService.getProfile(req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },
);

// POST /verifiers/me/api-key — UC-009: generate / rotate (BR-009).
router.post(
  "/me/api-key",
  requireVerifierJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res
        .status(200)
        .json(
          success(await verifierAccountService.rotateApiKey(req.user!.sub)),
        );
    } catch (err) {
      next(err);
    }
  },
);

// GET /verifiers/me/requests?from&to — verification log for the portal.
router.get(
  "/me/requests",
  requireVerifierJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const range = parseOrThrow(RangeSchema, req.query);
      const to = range.to ? new Date(range.to) : new Date();
      const from = range.from
        ? new Date(range.from)
        : new Date(to.getTime() - 30 * 86_400_000);
      res
        .status(200)
        .json(
          success(
            await verifierAccountService.listRequests(req.user!.sub, from, to),
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

export default router;
