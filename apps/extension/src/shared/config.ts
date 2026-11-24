// Shared constants for the background worker and the popup.

/** Backend API base (IF-003, IF-005). Must be listed in manifest host_permissions. */
export const BACKEND_URL = "http://localhost:4000/api/v1";

/** End User web portal, opened from the popup footer. */
export const PORTAL_URL = "http://localhost:3000";

/** QR validity window (BR-002, BR-022, FR-031). Matches the backend. */
export const QR_TTL_MS = 120 * 1000;

/** Fast poll cadence while the worker is awake (DESIGN.md §1: poll every 2–3 s). */
export const FAST_POLL_MS = 2000;

/**
 * chrome.alarms heartbeat. Chrome clamps alarms to ≥ 30 s, so the alarm is
 * the durable backstop that revives polling after the service worker is
 * suspended; the 2 s loop gives the live feel while it is awake.
 */
export const POLL_ALARM = "nexusid-poll";
export const POLL_ALARM_PERIOD_MIN = 0.5;

/** Timeout for any single backend call. */
export const FETCH_TIMEOUT_MS = 10_000;

/** chrome.storage.local keys. */
export const PAIRING_KEY = "nexusid_pairing";
export const REQUEST_KEY = "nexusid_request";
