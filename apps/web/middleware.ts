import { type NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH_COOKIE = 'nexusid_token';
const LOGIN_PATH = '/auth/login';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production'
);

// ─── Protected route patterns ─────────────────────────────────────────────────

const PROTECTED_PREFIXES = ['/dashboard', '/verifier'];
const AUTH_ONLY_PATHS = ['/auth/login', '/auth/register']; // redirect away if already logged in

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p));
}

// ─── Token validation ─────────────────────────────────────────────────────────

async function isValidToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  const authenticated = token ? await isValidToken(token) : false;

  // Redirect unauthenticated users away from protected routes
  if (isProtected(pathname) && !authenticated) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set('next', pathname); // preserve intended destination
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login/register pages
  if (isAuthPage(pathname) && authenticated) {
    const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next();
}

// ─── Matcher ──────────────────────────────────────────────────────────────────
// Only run middleware on routes that need it — skip static files and API routes
// that handle their own auth.

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/verifier/:path*',
    '/auth/login',
    '/auth/register',
  ],
};
