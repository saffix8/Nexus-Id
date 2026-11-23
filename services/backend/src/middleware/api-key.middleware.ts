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
