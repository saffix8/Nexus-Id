import { type NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, AUTH_COOKIE_OPTIONS, VERIFIER_COOKIE } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// ─── Shared error response ────────────────────────────────────────────────────

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ─── POST /api/auth?action=login ──────────────────────────────────────────────

async function handleLogin(body: unknown): Promise<NextResponse> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    return errorResponse(data.error ?? 'Invalid email or password', res.status);
  }

  const token: string = data.data?.token;
  if (!token) {
    return errorResponse('No token returned from server', 500);
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set(AUTH_COOKIE, token, AUTH_COOKIE_OPTIONS);

  return response;
}

// ─── POST /api/auth?action=register ──────────────────────────────────────────

async function handleRegister(body: unknown): Promise<NextResponse> {
  const res = await fetch(`${BACKEND_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    return errorResponse(data.error ?? 'Registration failed', res.status);
  }

  // Auto-login after register: backend returns token on successful registration
  const token: string = data.data?.token;
  if (!token) {
    // Registration succeeded but no token — client will redirect to login
    return NextResponse.json({ success: true, autoLogin: false });
  }

  const response = NextResponse.json({ success: true, autoLogin: true });
  response.cookies.set(AUTH_COOKIE, token, AUTH_COOKIE_OPTIONS);

  return response;
}

// ─── POST /api/auth?action=logout ─────────────────────────────────────────────

function handleLogout(): NextResponse {
  const response = NextResponse.json({ success: true });

  response.cookies.set(AUTH_COOKIE, '', {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 0,
  });

  return response;
}

// ─── Service Provider portal (SRS FR-029, FR-033) ─────────────────────────────
// Separate cookie so a provider session never mixes with an End User session.

async function handleVerifierAuth(
  path: 'login' | 'register',
  body: unknown,
): Promise<NextResponse> {
  const res = await fetch(`${BACKEND_URL}/verifiers/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    return errorResponse(
      data.error ?? (path === 'login' ? 'Invalid email or password' : 'Registration failed'),
      res.status,
    );
  }

  const token: string | undefined = data.data?.token;
  if (!token) {
    return errorResponse('No token returned from server', 500);
  }

  // On register the backend returns the first API key — shown to the
  // provider once, never stored by the web app.
  const response = NextResponse.json({
    success: true,
    ...(path === 'register' ? { apiKey: data.data.apiKey as string } : {}),
  });
  response.cookies.set(VERIFIER_COOKIE, token, AUTH_COOKIE_OPTIONS);
  return response;
}

function handleVerifierLogout(): NextResponse {
  const response = NextResponse.json({ success: true });
  response.cookies.set(VERIFIER_COOKIE, '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

// ─── QR sign-in (SRS FR-036, API-023/024) ──────────────────────────────────────
// The poll token never reaches page JS: it sits in a short-lived httpOnly
// cookie bound to the challenge ID. When the phone approves, the first poll
// receives the session JWT from the backend and this route turns it into the
// normal End User session cookie.

const QR_SIGNIN_COOKIE = 'nexusid_qr_signin';
const QR_SIGNIN_COOKIE_OPTIONS = { ...AUTH_COOKIE_OPTIONS, maxAge: 180 };

async function handleQrStart(request: NextRequest): Promise<NextResponse> {
  const res = await fetch(`${BACKEND_URL}/qr-challenges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-user-agent': request.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify({ purpose: 'SIGN_IN' }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    return errorResponse(data.error ?? 'Could not create a sign-in code', res.status);
  }

  const { challengeId, pollToken, qrPayload, expiresAt } = data.data as {
    challengeId: string;
    pollToken: string;
    qrPayload: string;
    expiresAt: string;
  };
  const response = NextResponse.json({ success: true, data: { challengeId, qrPayload, expiresAt } });
  response.cookies.set(QR_SIGNIN_COOKIE, `${challengeId}.${pollToken}`, QR_SIGNIN_COOKIE_OPTIONS);
  return response;
}

async function handleQrStatus(request: NextRequest, body: unknown): Promise<NextResponse> {
  const challengeId = (body as { challengeId?: unknown })?.challengeId;
  const stored = request.cookies.get(QR_SIGNIN_COOKIE)?.value ?? '';
  const dot = stored.indexOf('.');
  if (typeof challengeId !== 'string' || dot < 0 || stored.slice(0, dot) !== challengeId) {
    // Another tab started a newer code, or the cookie expired.
    return errorResponse('This sign-in code is no longer active', 409);
  }

  const res = await fetch(`${BACKEND_URL}/qr-challenges/${encodeURIComponent(challengeId)}`, {
    headers: { 'x-challenge-token': stored.slice(dot + 1) },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    return errorResponse(data.error ?? 'Could not check the sign-in code', res.status);
  }

  const { state, sessionToken } = data.data as { state: string; sessionToken?: string };
  const response = NextResponse.json({ success: true, data: { state, signedIn: Boolean(sessionToken) } });
  if (sessionToken) {
    response.cookies.set(AUTH_COOKIE, sessionToken, AUTH_COOKIE_OPTIONS);
    response.cookies.set(QR_SIGNIN_COOKIE, '', { ...QR_SIGNIN_COOKIE_OPTIONS, maxAge: 0 });
  }
  return response;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'logout') {
    return handleLogout();
  }

  if (action === 'verifier-logout') {
    return handleVerifierLogout();
  }

  if (action === 'qr-start') {
    try {
      return await handleQrStart(request);
    } catch {
      return errorResponse('Unable to reach NexusID. Check that the backend is running.', 503);
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid request body', 400);
  }

  try {
    switch (action) {
      case 'login':
        return await handleLogin(body);

      case 'register':
        return await handleRegister(body);

      case 'verifier-login':
        return await handleVerifierAuth('login', body);

      case 'verifier-register':
        return await handleVerifierAuth('register', body);

      case 'qr-status':
        return await handleQrStatus(request, body);


      default:
        return errorResponse(`Unknown action: ${action ?? '(none)'}`, 400);
    }
  } catch (err) {
    console.error('[auth route]', err);
    return errorResponse('An unexpected error occurred', 500);
  }
}
