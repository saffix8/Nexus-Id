// NexusID background service worker (MOD-7, Chrome MV3).
//
//   Pairing      API-023 POST /qr-challenges            (FR-031)
//                API-024 GET  /qr-challenges/:id         x-pairing-token
//                DELETE /pairings/self                   x-pairing-token (unpair)
//   Relay        API-032 POST /verification/request      x-pairing-token (FR-032)
//   Poll         API-033 GET  /verification/request/:id  x-poll-secret   (FR-034)
//   Notify       chrome.notifications                    (FR-033, popup may be closed)
//
// No state lives in memory between events: everything is in
// chrome.storage.local. chrome.alarms is the durable poll scheduler; while the
// worker is awake a 2 s loop keeps the popup and page live.

import { predicateLabel } from "@nexusid/types";
import {
  BACKEND_URL,
  FAST_POLL_MS,
  FETCH_TIMEOUT_MS,
  PAIRING_KEY,
  POLL_ALARM,
  POLL_ALARM_PERIOD_MIN,
  REQUEST_KEY,
} from "../shared/config";
import type {
  PairingRecord,
  PopupMessage,
  RequestOutcome,
  RequestRecord,
  WorkerReply,
} from "../shared/state";

// ─── Storage ────────────────────────────────────────────────────────────────

async function getPairing(): Promise<PairingRecord | null> {
  const r = await chrome.storage.local.get(PAIRING_KEY);
  const p = r[PAIRING_KEY] as
    (Partial<PairingRecord> & Record<string, unknown>) | undefined;
  if (!p || typeof p !== "object") return null;

  // Records written by extension v1.0 used snake_case; carry them over.
  if (!("pairingToken" in p) && typeof p.pairing_token === "string") {
    const migrated: PairingRecord =
      p.status === "paired"
        ? {
            status: "paired",
            challengeId: String(p.challenge_id ?? ""),
            pairingToken: p.pairing_token,
            deviceName: null,
            pairedAt: null,
          }
        : {
            status: "pending",
            challengeId: String(p.challenge_id ?? ""),
            pairingToken: p.pairing_token,
            qrPayload: String(p.qr_payload ?? ""),
            expiresAt: String(p.expires_at ?? new Date(0).toISOString()),
            createdAt: Date.now(),
          };
    await setPairing(migrated);
    return migrated;
  }
  return p as PairingRecord;
}

async function setPairing(p: PairingRecord): Promise<void> {
  await chrome.storage.local.set({ [PAIRING_KEY]: p });
}

async function clearPairing(): Promise<void> {
  await chrome.storage.local.remove(PAIRING_KEY);
}

async function getRequest(): Promise<RequestRecord | null> {
  const r = await chrome.storage.local.get(REQUEST_KEY);
  return (r[REQUEST_KEY] as RequestRecord | undefined) ?? null;
}

async function setRequest(req: RequestRecord | null): Promise<void> {
  if (req) await chrome.storage.local.set({ [REQUEST_KEY]: req });
  else await chrome.storage.local.remove(REQUEST_KEY);
}

// ─── Backend calls ──────────────────────────────────────────────────────────

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

class NetworkError extends Error {}

/** Calls the backend and unwraps { success, data, error } (SRS §5.3). */
async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetworkError(
      controller.signal.aborted
        ? "The NexusID server did not respond in time."
        : "Could not reach the NexusID server. Is the backend running on :4000?",
    );
  } finally {
    clearTimeout(timer);
  }

  let body: { data?: T; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body; handled by status below.
  }
  return {
    ok: res.ok,
    status: res.status,
    data: (body?.data ?? null) as T | null,
    error: body?.error ?? (res.ok ? null : `HTTP ${res.status}`),
  };
}

// ─── Pairing (FR-031, FR-003, FR-038) ──────────────────────────────────────

interface CreatedChallenge {
  challengeId: string;
  pairingToken: string;
  expiresAt: string;
  qrPayload: string;
}

interface ChallengeStatus {
  state: "PENDING" | "REDEEMED" | "EXPIRED";
  active?: boolean;
  deviceName?: string | null;
  redeemedAt: string | null;
}

/** API-023 — a fresh single-use pairing QR (BR-002). Replaces any pending one. */
async function startPairing(): Promise<PairingRecord> {
  const r = await api<CreatedChallenge>("/qr-challenges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "PAIRING" }),
  });
  if (!r.ok || !r.data)
    throw new Error(r.error ?? "Could not create a pairing code.");

  const record: PairingRecord = {
    status: "pending",
    challengeId: r.data.challengeId,
    pairingToken: r.data.pairingToken,
    qrPayload: r.data.qrPayload,
    expiresAt: r.data.expiresAt,
    createdAt: Date.now(),
  };
  await setPairing(record);
  return record;
}

/**
 * API-024 — refresh the pairing. A pending code becomes "paired" once the
 * phone redeems it; a paired browser learns if the phone revoked it.
 */
async function checkPairing(): Promise<PairingRecord | null> {
  const pairing = await getPairing();
  if (!pairing) return null;

  const r = await api<ChallengeStatus>(
    `/qr-challenges/${pairing.challengeId}`,
    {
      headers: { "x-pairing-token": pairing.pairingToken },
    },
  );

  if (r.status === 404) {
    // The backend does not know this token (DB reset, or a stale record).
    await clearPairing();
    return null;
  }
  if (!r.ok || !r.data) return pairing; // transient; keep what we have

  const s = r.data;
  if (s.state === "REDEEMED") {
    // `active` is absent on an older backend; treat REDEEMED as live then.
    if (s.active === false) {
      await clearPairing();
      return null;
    }
    const paired: PairingRecord = {
      status: "paired",
      challengeId: pairing.challengeId,
      pairingToken: pairing.pairingToken,
      deviceName:
        s.deviceName ??
        (pairing.status === "paired" ? pairing.deviceName : null),
      pairedAt: s.redeemedAt,
    };
    const changed =
      pairing.status !== "paired" ||
      pairing.deviceName !== paired.deviceName ||
      pairing.pairedAt !== paired.pairedAt;
    if (changed) await setPairing(paired);
    return paired;
  }
  return pairing; // PENDING or EXPIRED: the popup shows the countdown / expiry
}

/** Unpair this browser. Revokes server-side first (best effort), then forgets locally. */
async function unpair(): Promise<void> {
  const pairing = await getPairing();
  if (pairing) {
    try {
      await api("/pairings/self", {
        method: "DELETE",
        headers: { "x-pairing-token": pairing.pairingToken },
      });
    } catch {
      // Offline: the token is deleted below, so nobody can use it.
    }
  }
  await clearPairing();
  await stopPolling();
  await setRequest(null);
}

// ─── Relay (FR-032) ─────────────────────────────────────────────────────────

interface DetectedMessage {
  type: "VERIFICATION_REQUEST_DETECTED";
  session_id: string;
  nonce: string;
  page_url: string;
}

interface RelayResult {
  requestId: string;
  pollSecret: string;
  verifierName: string;
  predicate: string;
  requestedFields?: string[];
  expiresAt: string;
}

/** Returns the reply shape content.js expects. */
async function relay(msg: DetectedMessage, tabId: number | null) {
  const { session_id, nonce, page_url } = msg;
  if (!session_id || !nonce || !page_url) {
    throw new Error(
      "The page's NexusID snippet is missing a session ID or nonce.",
    );
  }

  // A QR redeemed while the popup was closed is still "pending" locally.
  let pairing = await getPairing();
  if (pairing?.status === "pending") pairing = await checkPairing();
  if (!pairing || pairing.status !== "paired") {
    throw new Error(
      "This browser is not paired with your NexusID app yet. Open the NexusID extension and scan its code with your phone.",
    );
  }

  const r = await api<RelayResult>("/verification/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pairing-token": pairing.pairingToken,
    },
    body: JSON.stringify({ sessionId: session_id, nonce, pageUrl: page_url }),
  });

  if (!r.ok || !r.data?.requestId || !r.data.pollSecret) {
    const detail = r.error ?? "unexpected response";
    if (r.status === 409 && /not paired/i.test(detail)) {
      await clearPairing(); // revoked from the phone or portal
      throw new Error(
        "This browser is no longer paired with your NexusID app. Open the extension to pair again.",
      );
    }
    if (r.status === 404)
      throw new Error(
        "This page's verification session is not valid. Reload the page.",
      );
    if (r.status === 410)
      throw new Error(
        "This verification session has expired. Reload the page to start a new one.",
      );
    if (r.status === 409)
      throw new Error(
        "This verification session was already used. Reload the page to start a new one.",
      );
    throw new Error(`NexusID could not start verification: ${detail}`);
  }

  const d = r.data;
  const req: RequestRecord = {
    localId: crypto.randomUUID(),
    backendId: d.requestId,
    tabId,
    pageUrl: page_url,
    pollSecret: d.pollSecret,
    verifierName: d.verifierName || "A website",
    predicate: d.predicate,
    predicateLabel: predicateLabel(d.predicate),
    outcome: "PENDING",
    createdAt: Date.now(),
    expiresAt: d.expiresAt,
    decidedAt: null,
    reason: null,
  };
  await setRequest(req);
  await setBadge("PENDING");

  // FR-033 — shown even when the popup is closed (DESIGN.md §6.3 wording).
  notify(
    req.backendId,
    "NexusID",
    `${req.verifierName} asks: ${req.predicateLabel} — check your phone`,
  );

  await startPolling();

  return {
    request_id: req.localId,
    verifier_name: req.verifierName,
    requested_fields: d.requestedFields ?? [d.predicate],
  };
}

// ─── Poll (FR-034) ──────────────────────────────────────────────────────────

interface PollResult {
  status: string;
  outcome: RequestOutcome;
  decidedAt?: string;
  callbackUrl?: string;
}

let fastLoopRunning = false;

async function startPolling(): Promise<void> {
  await chrome.alarms.create(POLL_ALARM, {
    delayInMinutes: POLL_ALARM_PERIOD_MIN,
    periodInMinutes: POLL_ALARM_PERIOD_MIN,
  });
  void fastLoop();
}

async function stopPolling(): Promise<void> {
  await chrome.alarms.clear(POLL_ALARM);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 2 s loop while the worker is awake. Single instance per worker. */
async function fastLoop(): Promise<void> {
  if (fastLoopRunning) return;
  fastLoopRunning = true;
  try {
    while (await pollOnce()) await sleep(FAST_POLL_MS);
  } finally {
    fastLoopRunning = false;
  }
}

/** Polls API-033 once. Returns true while the request is still pending. */
async function pollOnce(): Promise<boolean> {
  const req = await getRequest();
  if (!req || req.outcome !== "PENDING" || !req.pollSecret) {
    await stopPolling();
    return false;
  }

  let r: ApiResult<PollResult>;
  try {
    r = await api<PollResult>(`/verification/request/${req.backendId}`, {
      headers: { "x-poll-secret": req.pollSecret },
    });
  } catch {
    // Offline: give up a little after the session's own expiry.
    if (Date.now() > Date.parse(req.expiresAt) + 10_000) {
      await finish(req, "EXPIRED", null, null);
      return false;
    }
    return true;
  }

  if (!r.ok || !r.data) {
    if (r.status === 401 || r.status === 403 || r.status === 404) {
      await finish(
        req,
        "FAILED",
        null,
        r.error ?? "The server no longer knows this request.",
      );
      return false;
    }
    return true; // 5xx: try again
  }

  const outcome = r.data.outcome;
  if (outcome === "PENDING") return true;
  await finish(
    req,
    outcome,
    r.data.decidedAt ?? null,
    null,
    r.data.callbackUrl ?? null,
  );
  return false;
}

/** Final outcome: store it, tell the page, raise a notification, stop polling. */
async function finish(
  req: RequestRecord,
  outcome: Exclude<RequestOutcome, "PENDING">,
  decidedAt: string | null,
  reason: string | null,
  callbackUrl: string | null = null,
): Promise<void> {
  // Another loop may have finished it already.
  const current = await getRequest();
  if (
    !current ||
    current.localId !== req.localId ||
    current.outcome !== "PENDING"
  )
    return;

  const done: RequestRecord = {
    ...current,
    outcome,
    decidedAt: decidedAt ?? new Date().toISOString(),
    reason:
      reason ??
      (outcome === "FAILED" ? "The proof could not be verified." : null),
    pollSecret: null, // only needed while pending
  };
  await setRequest(done);
  await stopPolling();
  await setBadge(outcome);

  // Same message protocol content.js has always used.
  const base = { request_id: done.localId, backend_request_id: done.backendId };
  const toTab =
    outcome === "VERIFIED"
      ? {
          type: "VERIFICATION_COMPLETE",
          ...base,
          verified_fields: {},
          callback_url: callbackUrl,
        }
      : outcome === "DECLINED"
        ? { type: "VERIFICATION_REJECTED", ...base }
        : outcome === "EXPIRED"
          ? { type: "VERIFICATION_EXPIRED", ...base }
          : { type: "VERIFICATION_ERROR", ...base, error: done.reason };
  if (done.tabId != null) {
    chrome.tabs.sendMessage(done.tabId, toTab).catch(() => {
      // Tab closed or navigated away; the popup still shows the outcome.
    });
  }

  const v = done.verifierName;
  const body: Record<typeof outcome, string> = {
    VERIFIED: `Verified for ${v} · ${done.predicateLabel}`,
    FAILED: `${v}: verification failed`,
    DECLINED: `You declined ${v}'s request`,
    EXPIRED: `${v}'s request expired`,
  };
  notify(done.backendId, "NexusID", body[outcome]);
}

// ─── Badge + notifications ─────────────────────────────────────────────────

async function setBadge(outcome: RequestOutcome | null): Promise<void> {
  const map: Record<RequestOutcome, [string, string]> = {
    PENDING: ["•", "#3B6FE8"],
    VERIFIED: ["✓", "#22C55E"],
    FAILED: ["!", "#EF4444"],
    DECLINED: ["", "#525A72"],
    EXPIRED: ["", "#F59E0B"],
  };
  const [text, color] = outcome ? map[outcome] : ["", "#3B6FE8"];
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

function notify(id: string, title: string, message: string): void {
  chrome.notifications.create(`nexusid:${id}:${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    priority: 2,
  });
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);
  const req = await getRequest();
  if (req?.tabId != null) {
    chrome.tabs.update(req.tabId, { active: true }).catch(() => {});
  }
});

// ─── Events ─────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void fastLoop();
});

/** Resume a pending request after a browser restart or extension reload. */
async function resume(): Promise<void> {
  const req = await getRequest();
  if (req?.outcome === "PENDING") await startPolling();
  else await setBadge(req?.outcome === "VERIFIED" ? "VERIFIED" : null);
}
chrome.runtime.onStartup.addListener(() => void resume());
chrome.runtime.onInstalled.addListener(async () => {
  // v1.0 kept one storage entry per request (keyed by UUID, with local_id).
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter(
    (k) => k !== PAIRING_KEY && k !== REQUEST_KEY && (all[k] as { local_id?: unknown })?.local_id,
  );
  if (stale.length) await chrome.storage.local.remove(stale);
  await resume();
});

function reply<T>(
  p: Promise<T>,
  sendResponse: (r: WorkerReply<T>) => void,
): true {
  p.then((data) => sendResponse({ success: true, data })).catch(
    (err: unknown) =>
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
  );
  return true; // keep the channel open for the async reply
}

chrome.runtime.onMessage.addListener(
  (message: PopupMessage | DetectedMessage, sender, sendResponse) => {
    switch (message?.type) {
      // From content.js — it expects { success, request_id, verifier_name, requested_fields } flat.
      case "VERIFICATION_REQUEST_DETECTED":
        relay(message, sender.tab?.id ?? null)
          .then((r) => sendResponse({ success: true, ...r }))
          .catch((err: unknown) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        return true;

      // From the popup.
      case "START_PAIRING":
        return reply(startPairing(), sendResponse);
      case "CHECK_PAIRING":
        return reply(checkPairing(), sendResponse);
      case "UNPAIR":
        return reply(unpair(), sendResponse);
      case "POLL_NOW":
        return reply(
          fastLoopRunning
            ? Promise.resolve(true)
            : pollOnce().then(
                (pending) => (pending && void fastLoop(), pending),
              ),
          sendResponse,
        );
      case "DISMISS_REQUEST":
        return reply(
          (async () => {
            const req = await getRequest();
            if (req && req.outcome !== "PENDING") {
              await setRequest(null);
              await setBadge(null);
            }
          })(),
          sendResponse,
        );
      default:
        return false;
    }
  },
);
