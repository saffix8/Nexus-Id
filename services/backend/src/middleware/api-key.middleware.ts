// services/backend/src/middleware/api-key.middleware.ts
//
// Service Provider authentication (SRS FR-034). A Service Provider's API key
// authenticates every verification request sent on its behalf. The verifier
// identity is derived from the key — never from a client-supplied field.

import type { Request, Response, NextFunction } from "express";
import type { Verifier } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { failure } from "../lib/response.js";
import { hashApiKey } from "../services/verifier-account.service.js";
import { requireVerifierJWT } from "./auth.middleware.js";

declare global {
  namespace Express {
    interface Request {
      verifier?: Verifier;
    }
  }
}

export const API_KEY_HEADER = "x-api-key";

/**
 * requireApiKey
 * Reads the `x-api-key` header, resolves the owning Verifier, and attaches it
 * to `req.verifier`. Returns 401 when the key is missing or unknown.
 */
export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.header(API_KEY_HEADER);

  if (!apiKey) {
    res.status(401).json(failure(`Missing ${API_KEY_HEADER} header`));
    return;
  }

  try {
    // Keys are stored only as SHA-256 hashes (FR-034).
    const verifier = await prisma.verifier.findUnique({
      where: { apiKey: hashApiKey(apiKey) },
    });

    if (!verifier) {
      res.status(401).json(failure("Invalid API key"));
      return;
    }

    req.verifier = verifier;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * requireVerifierAuth
 * Service Provider routes that serve both the SP's own backend and the portal
 * (API-047/048). An `x-api-key` header is checked as an API key (and a bad key
 * is refused, never retried as a token); otherwise a portal JWT with role
 * "verifier" is required. Either way `req.verifier` is set.
 */
export async function requireVerifierAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.header(API_KEY_HEADER)) {
    await requireApiKey(req, res, next);
    return;
  }

  await requireVerifierJWT(req, res, async (err?: unknown) => {
    if (err) return next(err);
    try {
      const verifier = await prisma.verifier.findUnique({
        where: { id: req.user!.sub },
      });
      if (!verifier) {
        res.status(401).json(failure("Service Provider not found"));
        return;
      }
      req.verifier = verifier;
      next();
    } catch (e) {
      next(e);
    }
  });
}
