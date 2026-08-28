import type { Request, Response, NextFunction } from 'express';
import { jwtVerify, errors as JoseErrors } from 'jose';
import type { ApiResponse } from '@nexusid/types';

// ── Type augmentation ─────────────────────────────────────────────────────────
// Extend Express Request so downstream handlers can access req.user safely

export interface JWTPayload {
  sub: string;        // user id
  iat: number;
  exp: number;
  [key: string]: unknown;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

function unauthorizedResponse(message: string): ApiResponse<never> {
  return {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * verifyJWT
 * Reads `Authorization: Bearer <token>`, verifies it, and attaches the
 * decoded payload to `req.user`. Returns 401 on any failure.
 */
export async function verifyJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(unauthorizedResponse('Missing or malformed Authorization header'));
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  if (!token) {
    res.status(401).json(unauthorizedResponse('Token is empty'));
    return;
  }

  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    // Ensure required sub claim is present
    if (typeof payload.sub !== 'string' || !payload.sub) {
      res.status(401).json(unauthorizedResponse('Invalid token: missing subject claim'));
      return;
    }

    req.user = payload as JWTPayload;
    next();
  } catch (err) {
    if (err instanceof JoseErrors.JWTExpired) {
      res.status(401).json(unauthorizedResponse('Token has expired'));
      return;
    }

    if (
      err instanceof JoseErrors.JWSInvalid ||
      err instanceof JoseErrors.JWTInvalid ||
      err instanceof JoseErrors.JWSSignatureVerificationFailed
    ) {
      res.status(401).json(unauthorizedResponse('Invalid token signature'));
      return;
    }

    // Unknown error — don't leak internals
    res.status(401).json(unauthorizedResponse('Token verification failed'));
  }
}

/**
 * optionalJWT
 * Same as verifyJWT but does NOT reject — useful for routes that can be
 * accessed both authenticated and anonymously (e.g. public issuer lookups).
 */
export async function optionalJWT(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    req.user = payload as JWTPayload;
  } catch {
    // Silently ignore — req.user stays undefined
  }

  next();
}

/**
 * requireSelf
 * Ensures the authenticated user can only access their own resources.
 * Expects the route param to be :id (the userId).
 * Must be used AFTER verifyJWT.
 */
export function requireSelf(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json(unauthorizedResponse('Authentication required'));
    return;
  }

  const resourceUserId = req.params.id;

  if (req.user.sub !== resourceUserId) {
    res.status(403).json({
      success: false,
      error: 'Access denied: you can only access your own resources',
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse<never>);
    return;
  }

  next();
}
