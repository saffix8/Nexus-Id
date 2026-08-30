import { type NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, AUTH_COOKIE_OPTIONS } from '@/lib/auth';

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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'logout') {
    return handleLogout();
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


      default:
        return errorResponse(`Unknown action: ${action ?? '(none)'}`, 400);
    }
  } catch (err) {
    console.error('[auth route]', err);
    return errorResponse('An unexpected error occurred', 500);
  }
}
