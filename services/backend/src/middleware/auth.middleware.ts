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

/** Role claim carried by Service Provider portal tokens (SRS FR-033). */
export const VERIFIER_ROLE = 'verifier';

type BearerResult =
  | { ok: true; payload: JWTPayload }
  | { ok: false; error: string };

/**
 * Shared Bearer-token check used by every JWT middleware below, so token
 * verification lives in exactly one place.
 */
async function verifyBearer(req: Request): Promise<BearerResult> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'Missing or malformed Authorization header' };
  }

  const token = authHeader.slice(7); // strip "Bearer "

  if (!token) {
    return { ok: false, error: 'Token is empty' };
  }

  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    // Ensure required sub claim is present
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return { ok: false, error: 'Invalid token: missing subject claim' };
    }

    return { ok: true, payload: payload as JWTPayload };
  } catch (err) {
    if (err instanceof JoseErrors.JWTExpired) {
      return { ok: false, error: 'Token has expired' };
    }

    if (
      err instanceof JoseErrors.JWSInvalid ||
      err instanceof JoseErrors.JWTInvalid ||
      err instanceof JoseErrors.JWSSignatureVerificationFailed
    ) {
      return { ok: false, error: 'Invalid token signature' };
    }

    // Unknown error — don't leak internals
    return { ok: false, error: 'Token verification failed' };
  }
}

/**
 * verifyJWT
 * End User routes. Reads `Authorization: Bearer <token>`, verifies it, and
 * attaches the decoded payload to `req.user`. Service Provider tokens are
 * refused — their `sub` is a verifier ID, not a user ID. Returns 401 on any
 * failure.
 */
export async function verifyJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const result = await verifyBearer(req);

  if (!result.ok) {
    res.status(401).json(unauthorizedResponse(result.error));
    return;
  }

  if (result.payload.role === VERIFIER_ROLE) {
    res.status(401).json(unauthorizedResponse('Service Provider tokens cannot access End User routes'));
    return;
  }

  req.user = result.payload;
  next();
}

/**
 * requireVerifierJWT
 * Service Provider portal routes (SRS FR-033/FR-034). Accepts only tokens
 * issued by the provider login (role = "verifier"); `req.user.sub` is then
 * the Verifier ID.
 */
export async function requireVerifierJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const result = await verifyBearer(req);

  if (!result.ok) {
    res.status(401).json(unauthorizedResponse(result.error));
    return;
  }

  if (result.payload.role !== VERIFIER_ROLE) {
    res.status(401).json(unauthorizedResponse('A Service Provider login is required'));
    return;
  }

  req.user = result.payload;
  next();
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

/**
 * requireAdmin
 * Operator-only routes (audit logs, fraud flags). An End User JWT whose email
 * is listed in the comma-separated ADMIN_EMAILS env var. Unset = nobody:
 * default-deny, so a fresh deployment never exposes the audit trail to every
 * signed-in user.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await verifyJWT(req, res, () => {
    const admins = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = typeof req.user?.email === 'string' ? req.user.email.toLowerCase() : '';
    if (!email || !admins.includes(email)) {
      res.status(403).json(unauthorizedResponse('Administrator access required'));
      return;
    }
    next();
  });
}
