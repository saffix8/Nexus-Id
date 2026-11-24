/**
 * Shop A checkout page (browser side).
 *
 * 1. Asks Shop A's own server for a NexusID session (server calls API-030 with
 *    the API key — the key never reaches this bundle).
 * 2. Renders the FR-032 integration snippet:
 *      <div id="nexusid-verify" data-session-id data-nonce data-platform data-condition>
 *    The NexusID extension's content script picks it up and mounts its UI in it.
 * 3. Polls the outcome through Shop A's server (API-031) every 2 s.
 *    VERIFIED unlocks "Place order"; DECLINED / EXPIRED / FAILED offer "Try again",
 *    which opens a fresh session (sessions are single-use, BR-005).
 */

import "./style.css";

type Outcome = "PENDING" | "VERIFIED" | "DECLINED" | "EXPIRED" | "FAILED";
type PanelState =
  | "loading"
  | "pending"
  | "verified"
  | "declined"
  | "expired"
  | "failed"
  | "error"
  | "ordered";

interface Session {
  sessionId: string;
  nonce: string;
  platform: string;
  condition: string;
  conditionLabel: string;
  expiresAt: string;
}

interface OutcomeResponse {
  outcome: Outcome;
  conditionLabel: string;
  expiresAt: string | null;
  decidedAt: string | null;
}

const POLL_MS = 2000;
const REQUEST_TIMEOUT_MS = 8000;
const EXTENSION_GRACE_MS = 2500;

// ─── Elements ────────────────────────────────────────────────────────────────

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

const panel = $("nx-panel");
const statusText = $("nx-status-text");
const countdown = $("nx-countdown");
const slot = $("nx-slot");
const banner = $("nx-banner");
const problem = $("nx-problem");
const problemTitle = $("nx-problem-title");
const problemBody = $("nx-problem-body");
const retryBtn = $<HTMLButtonElement>("nx-retry");
const snippet = $("nx-snippet");
const orderBtn = $<HTMLButtonElement>("order-btn");
const orderLabel = $("order-label");
const orderHint = $("order-hint");
const confirmation = $("confirmation");
const orderNumber = $("order-number");

// ─── State ───────────────────────────────────────────────────────────────────

let session: Session | null = null;
/** Bumped on every new session so late responses from an old one are ignored. */
let generation = 0;
let pollTimer: number | undefined;
let countdownTimer: number | undefined;
let extensionTimer: number | undefined;
let pollFailures = 0;

// ─── HTTP (same-origin Shop A server only) ───────────────────────────────────

class ShopApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function shopApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ShopApiError(
      "Shop A could not be reached. Check your connection.",
      0,
    );
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok)
    throw new ShopApiError(
      body.error ?? `Request failed (HTTP ${res.status})`,
      res.status,
    );
  return body;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

const STATUS_COPY: Record<PanelState, string> = {
  loading: "Starting a secure session…",
  pending: "Waiting for approval on your phone",
  verified: "Verified",
  declined: "Declined",
  expired: "Expired",
  failed: "Failed",
  error: "Could not start verification",
  ordered: "Verified",
};

function setState(state: PanelState): void {
  panel.dataset.state = state;
  statusText.textContent = STATUS_COPY[state];

  const terminalProblem =
    state === "declined" ||
    state === "expired" ||
    state === "failed" ||
    state === "error";
  problem.hidden = !terminalProblem;
  banner.hidden = !(state === "verified" || state === "ordered");

  if (state !== "pending") {
    stopCountdown();
    countdown.textContent = "";
  }

  const unlocked = state === "verified";
  orderBtn.disabled = !unlocked;
  orderBtn.classList.toggle("unlocked", unlocked || state === "ordered");
  orderHint.textContent = unlocked
    ? "Your age is confirmed. You can place the order."
    : state === "ordered"
      ? ""
      : "Verify your age to place the order.";
  orderHint.classList.remove("danger");
}

function showProblem(title: string, body: string): void {
  problemTitle.textContent = title;
  problemBody.textContent = body;
}

function renderSnippet(s: Session): void {
  snippet.textContent = [
    '<div id="nexusid-verify"',
    `     data-session-id="${s.sessionId}"`,
    `     data-nonce="${s.nonce}"`,
    `     data-platform="${s.platform}"`,
    `     data-condition="${s.condition}"></div>`,
  ].join("\n");
}

/** Builds the FR-032 element. A fresh node each time so the content script sees it as new. */
function mountIntegration(s: Session): void {
  slot.replaceChildren();

  const el = document.createElement("div");
  el.id = "nexusid-verify";
  el.dataset.sessionId = s.sessionId;
  el.dataset.nonce = s.nonce;
  el.dataset.platform = s.platform;
  el.dataset.condition = s.condition;

  // Shown only until the extension replaces the element's content.
  const fallback = document.createElement("p");
  fallback.className = "nx-fallback";
  fallback.textContent = "Looking for the NexusID extension…";
  el.appendChild(fallback);
  slot.appendChild(el);

  window.clearTimeout(extensionTimer);
  extensionTimer = window.setTimeout(() => {
    if (el.contains(fallback)) {
      fallback.textContent =
        "NexusID extension not found in this browser. Install it and pair your phone, then reload this page.";
      fallback.classList.add("missing");
    }
  }, EXTENSION_GRACE_MS);
}

// ─── Countdown ───────────────────────────────────────────────────────────────

function stopCountdown(): void {
  window.clearInterval(countdownTimer);
  countdownTimer = undefined;
}

function startCountdown(expiresAt: string): void {
  stopCountdown();
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return;

  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, "0");
    countdown.textContent = left > 0 ? `${m}:${s}` : "0:00";
    countdown.classList.toggle("warn", left <= 30);
    if (left === 0) stopCountdown();
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

// ─── Polling (API-031 through Shop A's server) ───────────────────────────────

function stopPolling(): void {
  window.clearTimeout(pollTimer);
  pollTimer = undefined;
}

function schedulePoll(delay = POLL_MS): void {
  stopPolling();
  pollTimer = window.setTimeout(poll, delay);
}

async function poll(): Promise<void> {
  if (!session) return;
  const gen = generation;
  const id = session.sessionId;

  try {
    const o = await shopApi<OutcomeResponse>(
      `/shop-api/session/${encodeURIComponent(id)}/outcome`,
    );
    if (gen !== generation) return;
    pollFailures = 0;
    applyOutcome(o);
  } catch (err) {
    if (gen !== generation) return;
    pollFailures += 1;
    if (pollFailures >= 3) {
      statusText.textContent = "Connection lost, retrying…";
    }
    if (
      err instanceof ShopApiError &&
      (err.status === 404 || err.status === 401)
    ) {
      setState("failed");
      showProblem("Verification could not be checked", err.message);
      return;
    }
    schedulePoll(POLL_MS * Math.min(pollFailures, 3));
  }
}

function applyOutcome(o: OutcomeResponse): void {
  switch (o.outcome) {
    case "PENDING":
      if (panel.dataset.state !== "pending") setState("pending");
      else statusText.textContent = STATUS_COPY.pending;
      schedulePoll();
      return;

    case "VERIFIED":
      stopPolling();
      setState("verified");
      return;

    case "DECLINED":
      stopPolling();
      setState("declined");
      showProblem(
        "Request declined",
        "The request was declined on the phone, so your age was not confirmed.",
      );
      return;

    case "EXPIRED":
      stopPolling();
      setState("expired");
      showProblem(
        "Request expired",
        "There was no answer from your phone in time. Start a new request to try again.",
      );
      return;

    case "FAILED":
    default:
      stopPolling();
      setState("failed");
      showProblem(
        "Verification failed",
        "NexusID could not confirm the proof from your phone. No order can be placed with this request.",
      );
  }
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

async function startSession(): Promise<void> {
  generation += 1;
  const gen = generation;
  session = null;
  pollFailures = 0;
  stopPolling();
  window.clearTimeout(extensionTimer);
  slot.replaceChildren();
  snippet.textContent = "";
  setState("loading");

  try {
    const s = await shopApi<Session>("/shop-api/session", { method: "POST" });
    if (gen !== generation) return;
    session = s;
    renderSnippet(s);
    mountIntegration(s);
    setState("pending");
    startCountdown(s.expiresAt);
    schedulePoll();
  } catch (err) {
    if (gen !== generation) return;
    setState("error");
    showProblem(
      "Could not start verification",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function placeOrder(): Promise<void> {
  if (!session || orderBtn.disabled) return;
  const id = session.sessionId;
  orderBtn.disabled = true;
  orderBtn.classList.add("busy");
  orderLabel.textContent = "Placing order…";

  try {
    // Shop A's server re-checks API-031 before accepting the order.
    const { orderNumber: num } = await shopApi<{ orderNumber: string }>(
      "/shop-api/order",
      {
        method: "POST",
        body: JSON.stringify({ sessionId: id }),
      },
    );
    setState("ordered");
    orderBtn.hidden = true;
    orderHint.hidden = true;
    orderNumber.textContent = num;
    confirmation.hidden = false;
    confirmation.focus();
    const current = document.querySelector(".steps li.current");
    current?.classList.replace("current", "done");
    current?.removeAttribute("aria-current");
    const last = document.querySelector(".steps li:last-child");
    last?.classList.add("current");
    last?.setAttribute("aria-current", "step");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    orderLabel.textContent = "Place order · Rs 19,249";
    if (
      err instanceof ShopApiError &&
      (err.status === 403 || err.status === 409)
    ) {
      // The server would not accept this verification: start over.
      setState("failed");
      showProblem("Order not accepted", message);
    } else {
      orderBtn.disabled = false;
      orderHint.textContent = message;
      orderHint.classList.add("danger");
    }
  } finally {
    orderBtn.classList.remove("busy");
  }
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

retryBtn.addEventListener("click", () => void startSession());
orderBtn.addEventListener("click", () => void placeOrder());

// The extension announces outcomes on the page (FR-017). Not trusted —
// it only makes us ask our server right away instead of waiting for the next poll.
document.addEventListener("nexusid:result", () => {
  if (session && panel.dataset.state === "pending") schedulePoll(0);
});

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    session &&
    panel.dataset.state === "pending"
  )
    schedulePoll(0);
});

void startSession();
