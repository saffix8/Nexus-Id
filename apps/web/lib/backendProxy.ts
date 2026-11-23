// apps/web/lib/backendProxy.ts
//
// Single place that forwards a browser request to the backend API, turning
// the httpOnly auth cookie into a Bearer token. Used by every
// app/api/v1/<resource>/[[...path]] route handler.

import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, VERIFIER_COOKIE } from "@/lib/auth";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

type RouteContext = { params: Promise<{ path?: string[] }> };
type RouteHandler = (
  request: NextRequest,
  context: RouteContext,
) => Promise<NextResponse>;

type Session = "user" | "verifier";

async function proxy(
  request: NextRequest,
  resource: string,
  path: string[] | undefined,
  session: Session,
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(session === "verifier" ? VERIFIER_COOKIE : AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  const suffix = path?.length ? `/${path.join("/")}` : "";
  const query = request.nextUrl.search; // forward ?from=...&to=...
  const url = `${BACKEND_URL}/${resource}${suffix}${query}`;

  const init: RequestInit = {
    method: request.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (request.method !== "GET" && request.method !== "DELETE") {
    init.body = await request.text();
  }

  const res = await fetch(url, init);
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

/**
 * Route handler that proxies `/api/v1/<resource>/...` to the backend using
 * the End User session (default) or the Service Provider session.
 */
export function backendProxy(
  resource: string,
  options: { session?: Session } = {},
): RouteHandler {
  return async (request, { params }) => {
    const { path } = await params;
    return proxy(request, resource, path, options.session ?? "user");
  };
}
