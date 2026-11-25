import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// ─── Constants ────────────────────────────────────────────────────────────────
// Edge runtime: keep in sync with lib/auth.ts (AUTH_COOKIE / VERIFIER_COOKIE).

const AUTH_COOKIE = "nexusid_token"; // End User session
const VERIFIER_COOKIE = "nexusid_verifier_token"; // Service Provider session (FR-033)
const VERIFIER_ROLE = "verifier";
const LOGIN_PATH = "/auth/login";
const PROVIDER_LOGIN_PATH = "/auth/provider-login"; // SCR-017

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-in-production",
);

const AUTH_ONLY_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/provider-register",
  "/auth/provider-login",
];

// ─── Token validation ─────────────────────────────────────────────────────────

type Role = "user" | "verifier";

/** True when the token is valid AND belongs to the expected portal. */
async function hasValidSession(
  token: string | undefined,
  role: Role,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const isVerifier = payload.role === VERIFIER_ROLE;
    return role === "verifier" ? isVerifier : !isVerifier;
  } catch {
    return false;
  }
}

function redirectToLogin(request: NextRequest, role: Role): NextResponse {
  const loginUrl = new URL(
    role === "verifier" ? PROVIDER_LOGIN_PATH : LOGIN_PATH,
    request.url,
  );
  loginUrl.searchParams.set("next", request.nextUrl.pathname); // preserve destination
  return NextResponse.redirect(loginUrl);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl;

  // Service Provider portal (FR-033) — provider session only.
  if (pathname.startsWith("/verifier")) {
    const ok = await hasValidSession(
      request.cookies.get(VERIFIER_COOKIE)?.value,
      "verifier",
    );
    return ok ? NextResponse.next() : redirectToLogin(request, "verifier");
  }

  // End User dashboard — user session only.
  if (pathname.startsWith("/dashboard")) {
    const ok = await hasValidSession(
      request.cookies.get(AUTH_COOKIE)?.value,
      "user",
    );
    return ok ? NextResponse.next() : redirectToLogin(request, "user");
  }

  // Old combined login link for providers → the SP sign-in page.
  if (pathname === LOGIN_PATH && searchParams.get("role") === "provider") {
    const url = new URL(PROVIDER_LOGIN_PATH, request.url);
    const next = searchParams.get("next");
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // Already signed in for the chosen role → skip the login/register page.
  if (AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
    const role: Role =
      searchParams.get("role") === "provider" ||
      pathname.startsWith("/auth/provider-")
        ? "verifier"
        : "user";
    const cookie = role === "verifier" ? VERIFIER_COOKIE : AUTH_COOKIE;
    if (await hasValidSession(request.cookies.get(cookie)?.value, role)) {
      const fallback =
        role === "verifier" ? "/verifier/dashboard" : "/dashboard";
      // Same-portal paths only (no "//host" or other-portal open redirects).
      const next = searchParams.get("next");
      const portal = role === "verifier" ? "/verifier" : "/dashboard";
      const safe =
        next && next.startsWith(portal) && !next.startsWith("//")
          ? next
          : fallback;
      return NextResponse.redirect(new URL(safe, request.url));
    }
  }

  return NextResponse.next();
}

// ─── Matcher ──────────────────────────────────────────────────────────────────
// Only run middleware on routes that need it — skip static files and API routes
// that handle their own auth.

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/verifier/:path*",
    "/auth/login",
    "/auth/login/:path*", // password fallback for SCR-013
    "/auth/register",
    "/auth/provider-register",
    "/auth/provider-login",
  ],
};
