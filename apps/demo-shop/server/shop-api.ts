/**
 * Shop A's own server routes (Node side only — loaded by vite.config.ts, never
 * imported by anything under src/, so the API key cannot reach the browser
 * bundle).
 *
 *   POST /shop-api/session              → API-030, returns the integration snippet data
 *   GET  /shop-api/session/:id/outcome  → API-031, returns the session outcome
 *   POST /shop-api/order                → re-checks API-031 server-side, then "places" the order
 *
 * The page never talks to the NexusID backend directly. Page events from the
 * extension (`nexusid:result`) are only a hint; the order is accepted only when
 * this server reads VERIFIED from API-031 with the API key (FR-045).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";

/** Shop A's identity as a Service Provider (seeded by `npm run seed:demo`). */
const SHOP = {
  platform: "Shop A",
  predicate: "AGE_OVER_18",
} as const;

const NEXUSID_API_URL = (
  process.env.NEXUSID_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/+$/, "");

/** Server-side only. Defaults to the key created by `npm run seed:demo`. */
const SHOP_A_API_KEY = process.env.SHOP_A_API_KEY ?? "nxk_shop_a_demo_key_2026";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sessions already used for an order: one verification buys one order. */
const usedSessions = new Set<string>();

interface BackendEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SessionData {
  sessionId: string;
  nonce: string;
  predicate: string;
  predicateLabel: string;
  expiresAt: string;
}

interface OutcomeData {
  status: string;
  outcome: "PENDING" | "VERIFIED" | "DECLINED" | "EXPIRED" | "FAILED";
  predicate: string;
  predicateLabel: string;
  expiresAt?: string;
  decidedAt?: string;
  issuer?: string | null;
}

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function nexusid<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${NEXUSID_API_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": SHOP_A_API_KEY,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new UpstreamError(
      `Cannot reach NexusID at ${NEXUSID_API_URL}. Is the backend running?`,
      502,
    );
  }

  let body: BackendEnvelope<T> | null = null;
  try {
    body = (await res.json()) as BackendEnvelope<T>;
  } catch {
    /* non-JSON error page */
  }

  if (!res.ok || !body?.success || body.data === undefined) {
    const message = body?.error ?? `NexusID returned HTTP ${res.status}`;
    throw new UpstreamError(message, res.status >= 400 ? res.status : 502);
  }
  return body.data;
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof UpstreamError) {
    send(res, err.status, { error: err.message });
  } else {
    console.error("[shop-api]", err);
    send(res, 500, { error: "Shop A server error" });
  }
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 4096) throw new UpstreamError("Request body too large", 413);
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new UpstreamError("Invalid JSON body", 400);
  }
}

async function createSession(res: ServerResponse): Promise<void> {
  const s = await nexusid<SessionData>("/verification/sessions", {
    method: "POST",
    body: JSON.stringify({ predicate: SHOP.predicate }),
  });
  // Only what the page needs for the FR-032 snippet. No API key.
  send(res, 201, {
    sessionId: s.sessionId,
    nonce: s.nonce,
    platform: SHOP.platform,
    condition: s.predicate,
    conditionLabel: s.predicateLabel,
    expiresAt: s.expiresAt,
  });
}

async function readOutcome(
  res: ServerResponse,
  sessionId: string,
): Promise<void> {
  const o = await nexusid<OutcomeData>(
    `/verification/sessions/${sessionId}/outcome`,
  );
  send(res, 200, {
    outcome: o.outcome,
    conditionLabel: o.predicateLabel,
    expiresAt: o.expiresAt ?? null,
    decidedAt: o.decidedAt ?? null,
  });
}

async function placeOrder(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!UUID_RE.test(sessionId)) {
    send(res, 422, { error: "Missing or invalid sessionId" });
    return;
  }
  if (usedSessions.has(sessionId)) {
    send(res, 409, {
      error:
        "This verification was already used for an order. Verify again to place another.",
    });
    return;
  }

  // The trust anchor: Shop A's server asks NexusID itself (FR-045).
  const o = await nexusid<OutcomeData>(
    `/verification/sessions/${sessionId}/outcome`,
  );
  if (o.outcome !== "VERIFIED") {
    send(res, 403, { error: `Age not verified (session is ${o.outcome}).` });
    return;
  }

  usedSessions.add(sessionId);
  const orderNumber = `SA-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  send(res, 201, { orderNumber });
}

/** Connect middleware mounted by vite.config.ts for `vite` and `vite preview`. */
export const shopApi: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? "/", "http://shop.local");
  if (!url.pathname.startsWith("/shop-api/")) {
    next();
    return;
  }

  const outcomeMatch = url.pathname.match(
    /^\/shop-api\/session\/([^/]+)\/outcome$/,
  );

  let handler: Promise<void> | null = null;
  if (req.method === "POST" && url.pathname === "/shop-api/session") {
    handler = createSession(res);
  } else if (req.method === "GET" && outcomeMatch) {
    const id = decodeURIComponent(outcomeMatch[1] ?? "");
    if (!UUID_RE.test(id)) {
      send(res, 422, { error: "Invalid session ID" });
      return;
    }
    handler = readOutcome(res, id);
  } else if (req.method === "POST" && url.pathname === "/shop-api/order") {
    handler = placeOrder(req, res);
  }

  if (!handler) {
    send(res, 404, { error: "Not found" });
    return;
  }
  handler.catch((err) => sendError(res, err));
};
