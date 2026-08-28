import { jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// ─── Constants ────────────────────────────────────────────────────────────────

export const AUTH_COOKIE = 'nexusid_token';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production'
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Session {
  userId: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

// ─── getSession ───────────────────────────────────────────────────────────────

/**
 * Reads the JWT from the httpOnly cookie and decodes it.
 * Returns null if the cookie is missing or the token is invalid/expired.
 * Safe to call from Server Components and API routes.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE)?.value;

    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Validate required claims are present
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    // Token expired, malformed, or signature invalid
    return null;
  }
}

// ─── requireAuth ──────────────────────────────────────────────────────────────

/**
 * Server-side auth guard. Call at the top of any protected page.tsx.
 * Redirects to /auth/login if no valid session exists.
 *
 * Usage in page.tsx:
 *   const session = await requireAuth();
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();

  if (!session) {
    redirect('/auth/login');
  }

  return session;
}

// ─── logout ───────────────────────────────────────────────────────────────────

/**
 * Clears the auth cookie.
 * Call from a Server Action or API route — NOT directly from a Client Component.
 * After clearing, redirect to /.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // Immediately expire
  });

  redirect('/');
}

// ─── Cookie options (shared between auth route and logout) ────────────────────

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};
