/**
 * NexusID Background Service Worker
 * Manifest V3 — runs as a service worker (no persistent state in memory)
 *
 * Responsibilities:
 *   1. Receive verification requests detected by content.js
 *   2. POST them to the NexusID backend
 *   3. Poll for results every 5 seconds (up to 5 minutes)
 *   4. Relay results back to the originating tab's content script
 *   5. Show browser notifications on completion
 */

'use strict';

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const BACKEND_URL      = 'http://localhost:4000/api/v1';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60;   // 60 × 5s = 5 minutes
const STORAGE_TTL_MS   = 60 * 60 * 1000; // 1 hour — entries older than this are cleaned up
const NOTIFICATION_ICON = 'icons/icon48.png';

// ─── STARTUP ──────────────────────────────────────────────────────────────────

/**
 * On service worker activation, clean up stale storage entries from previous
 * sessions. Service workers can be terminated and restarted by Chrome; any
 * polling intervals are lost on termination, so this also recovers orphaned
 * requests by marking them expired.
 */
self.addEventListener('install', () => {
  console.log('[NexusID] Background service worker installed.');
  self.skipWaiting();
});

self.addEventListener('activate', async () => {
  console.log('[NexusID] Background service worker activated.');
  await cleanupStaleEntries();
  await recoverOrphanedRequests();
});

// ─── MESSAGE LISTENER ─────────────────────────────────────────────────────────

/**
 * Central message dispatcher. Handles messages from content.js and popup.js.
 *
 * Returning `true` from the listener keeps the message channel open for
 * async sendResponse calls — required for Manifest V3 service workers.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (message.type === 'VERIFICATION_REQUEST_DETECTED') {
    // Incoming request from content.js — start the verification flow
    handleVerificationRequest(message, tabId)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => {
        console.error('[NexusID] handleVerificationRequest failed:', err);
        sendResponse({ success: false, error: err.message || 'Unknown error' });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'CANCEL_VERIFICATION') {
    // Incoming cancel from popup.js
    cancelVerification(message.request_id, tabId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_ACTIVE_VERIFICATION') {
    // Popup polling for current state
    getActiveVerification()
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Unrecognised message type — respond immediately
  sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
  return false;
});

// ─── CORE: HANDLE VERIFICATION REQUEST ────────────────────────────────────────

/**
 * Entry point for a new verification request detected by content.js.
 *
 * 1. Generates a local request_id (UUID)
 * 2. POSTs the request to the NexusID backend
 * 3. Persists the request metadata to chrome.storage.local
 * 4. Starts polling for the result
 *
 * @param {object} request - The message payload from content.js
 * @param {number|null} tabId - The tab ID of the originating page
 * @returns {Promise<{ request_id: string }>}
 */
async function handleVerificationRequest(request, tabId) {
  const {
    verifier_id,
    verifier_name,
    requested_fields,
    nonce,
    callback_url,
    page_url,
  } = request;

  // Validate required fields before hitting the backend
  if (!verifier_id || !requested_fields || !nonce) {
    throw new Error('Missing required fields: verifier_id, requested_fields, nonce');
  }

  // Generate a local correlation ID so we can track this in storage
  const request_id = crypto.randomUUID();

  console.log(`[NexusID] New verification request ${request_id} from ${verifier_id}`);

  // POST to backend — may return a different server-assigned ID, but we track
  // by our local request_id in storage; the backend uses nonce for dedup
  let backendRequestId;
  try {
    const body = {
      verifier_id,
      verifier_name: verifier_name || verifier_id,
      requested_fields: Array.isArray(requested_fields) ? requested_fields : [requested_fields],
      nonce,
      callback_url: callback_url || null,
      page_url: page_url || null,
    };

    const response = await fetchWithTimeout(
      `${BACKEND_URL}/verification/request`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      10000 // 10 second timeout for the initial request
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Backend returned ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // Backend may return its own request_id — use that for polling
    backendRequestId = data.data?.request_id || data.request_id || request_id;

    console.log(`[NexusID] Backend acknowledged request. Polling id: ${backendRequestId}`);
  } catch (err) {
    console.error('[NexusID] Failed to POST verification request to backend:', err);
    throw new Error(`Could not reach NexusID backend: ${err.message}`);
  }

  // Persist to chrome.storage.local so the popup and recovery logic can read it
  const entry = {
    local_id:          request_id,
    backend_id:        backendRequestId,
    tab_id:            tabId,
    verifier_id,
    verifier_name:     verifier_name || verifier_id,
    requested_fields:  Array.isArray(requested_fields) ? requested_fields : [requested_fields],
    nonce,
    callback_url:      callback_url || null,
    page_url:          page_url || null,
    status:            'pending',
    poll_attempts:     0,
    created_at:        Date.now(),
    updated_at:        Date.now(),
  };

  await setStorageEntry(request_id, entry);

  // Begin polling — non-blocking; runs via setInterval inside the service worker
  startPolling(request_id, backendRequestId, tabId);

  return { request_id };
}

// ─── POLLING ──────────────────────────────────────────────────────────────────

/**
 * Polls the backend every POLL_INTERVAL_MS for the result of a verification
 * request. Clears itself on terminal states (completed, rejected, expired) or
 * when MAX_POLL_ATTEMPTS is reached.
 *
 * NOTE: Service workers can be suspended by Chrome between ticks. The interval
 * itself survives suspension on Chrome 116+ (persistent keepalive), but if the
 * worker IS terminated, recoverOrphanedRequests() on next activation handles it.
 *
 * @param {string} localId     - Our local tracking ID (chrome.storage key)
 * @param {string} backendId   - The ID the backend uses for this request
 * @param {number|null} tabId  - Tab to notify on completion
 */
function startPolling(localId, backendId, tabId) {
  console.log(`[NexusID] Starting polling for request ${backendId} (local: ${localId})`);

  // Store the interval ID in a module-level map so we can cancel it
  // (service worker memory — lost on termination, which is why we have recovery)
  activePolls.set(localId, { attempts: 0 });

  const intervalId = setInterval(async () => {
    const poll = activePolls.get(localId);
    if (!poll) {
      // Entry was removed (cancelled externally)
      clearInterval(intervalId);
      return;
    }

    poll.attempts += 1;

    // Hard stop — max attempts reached
    if (poll.attempts > MAX_POLL_ATTEMPTS) {
      console.warn(`[NexusID] Max poll attempts reached for ${backendId}. Marking expired.`);
      clearInterval(intervalId);
      activePolls.delete(localId);
      await handleTerminalState(localId, tabId, 'expired');
      return;
    }

    // Fetch current status from backend
    let data;
    try {
      const response = await fetchWithTimeout(
        `${BACKEND_URL}/verification/request/${backendId}`,
        { method: 'GET' },
        8000
      );

      if (!response.ok) {
        // 404 means the request was never found on the backend — treat as expired
        if (response.status === 404) {
          console.warn(`[NexusID] Request ${backendId} not found on backend (404). Stopping poll.`);
          clearInterval(intervalId);
          activePolls.delete(localId);
          await handleTerminalState(localId, tabId, 'expired');
          return;
        }
        // Other HTTP errors — log and keep polling (may be transient)
        console.warn(`[NexusID] Poll got HTTP ${response.status} for ${backendId}. Continuing.`);
        return;
      }

      const json = await response.json();
      data = json.data || json; // handle both ApiResponse<T> and raw shapes
    } catch (err) {
      // Network error — transient. Log and keep polling.
      console.warn(`[NexusID] Network error polling ${backendId}:`, err.message);
      return;
    }

    const status = data.status;
    console.log(`[NexusID] Poll #${poll.attempts} for ${backendId}: status = ${status}`);

    if (status === 'completed') {
      clearInterval(intervalId);
      activePolls.delete(localId);

      // Update storage
      await updateStorageEntry(localId, {
        status:       'completed',
        verified_fields: data.verified_fields || {},
        callback_url:    data.callback_url || null,
        updated_at:   Date.now(),
      });

      // Notify the tab
      await notifyTab(tabId, {
        type:            'VERIFICATION_COMPLETE',
        verified_fields: data.verified_fields || {},
        callback_url:    data.callback_url || null,
      });

      // Browser notification
      showBrowserNotification(
        'Verification Complete',
        'Your identity was verified successfully'
      );

      console.log(`[NexusID] Verification ${backendId} completed.`);

    } else if (status === 'rejected') {
      clearInterval(intervalId);
      activePolls.delete(localId);
      await handleTerminalState(localId, tabId, 'rejected');
      console.log(`[NexusID] Verification ${backendId} rejected.`);

    } else if (status === 'expired') {
      clearInterval(intervalId);
      activePolls.delete(localId);
      await handleTerminalState(localId, tabId, 'expired');
      console.log(`[NexusID] Verification ${backendId} expired (server-side).`);

    }
    // status === 'pending' → do nothing, keep polling

  }, POLL_INTERVAL_MS);

  // Store the interval ID so we can cancel from cancelVerification()
  const poll = activePolls.get(localId);
  if (poll) poll.intervalId = intervalId;
}

/**
 * In-memory map of active polls.
 * Keys: localId. Values: { attempts, intervalId }.
 * Cleared on service worker termination — recovered via recoverOrphanedRequests().
 */
const activePolls = new Map();

// ─── TERMINAL STATE HANDLER ────────────────────────────────────────────────────

/**
 * Handles a terminal poll outcome (rejected or expired).
 * Updates storage and notifies the originating tab.
 *
 * @param {string} localId
 * @param {number|null} tabId
 * @param {'rejected'|'expired'} state
 */
async function handleTerminalState(localId, tabId, state) {
  await updateStorageEntry(localId, { status: state, updated_at: Date.now() });

  const messageType =
    state === 'rejected' ? 'VERIFICATION_REJECTED' : 'VERIFICATION_EXPIRED';

  await notifyTab(tabId, { type: messageType });

  if (state === 'rejected') {
    showBrowserNotification('Verification Rejected', 'The verification request was rejected.');
  } else {
    showBrowserNotification('Verification Expired', 'The verification request timed out.');
  }
}

// ─── CANCEL ───────────────────────────────────────────────────────────────────

/**
 * Cancels an in-flight verification.
 * Clears the polling interval and marks the entry as expired in storage.
 *
 * @param {string} requestId - The localId of the request to cancel
 * @param {number|null} tabId - Tab to notify (optional — caller may be the popup)
 */
async function cancelVerification(requestId, tabId) {
  const poll = activePolls.get(requestId);
  if (poll && poll.intervalId) {
    clearInterval(poll.intervalId);
  }
  activePolls.delete(requestId);

  await updateStorageEntry(requestId, { status: 'expired', updated_at: Date.now() });

  // Find the real tabId from storage if the caller (popup) doesn't have it
  const entry = await getStorageEntry(requestId);
  const targetTabId = tabId || (entry && entry.tab_id) || null;

  await notifyTab(targetTabId, { type: 'VERIFICATION_EXPIRED' });

  console.log(`[NexusID] Verification ${requestId} cancelled by user.`);
}

// ─── POPUP SUPPORT ────────────────────────────────────────────────────────────

/**
 * Returns the most recent non-expired, non-complete verification entry
 * for the popup to display.
 *
 * @returns {Promise<object|null>}
 */
async function getActiveVerification() {
  const all = await chrome.storage.local.get(null);
  let latest = null;

  for (const [key, entry] of Object.entries(all)) {
    if (!isVerificationEntry(entry)) continue;
    if (entry.status === 'pending') {
      if (!latest || entry.created_at > latest.created_at) {
        latest = { ...entry, local_id: key };
      }
    }
  }

  // Also return the most recent completed/rejected for the popup to show
  if (!latest) {
    let mostRecent = null;
    for (const [key, entry] of Object.entries(all)) {
      if (!isVerificationEntry(entry)) continue;
      if (!mostRecent || entry.updated_at > mostRecent.updated_at) {
        mostRecent = { ...entry, local_id: key };
      }
    }
    return mostRecent;
  }

  return latest;
}

// ─── BROWSER NOTIFICATIONS ────────────────────────────────────────────────────

/**
 * Shows a Chrome browser notification.
 * Uses a unique ID per call to avoid replacing existing ones.
 *
 * @param {string} title
 * @param {string} message
 */
function showBrowserNotification(title, message) {
  const notifId = `nexusid-${Date.now()}`;
  chrome.notifications.create(notifId, {
    type:    'basic',
    iconUrl: NOTIFICATION_ICON,
    title,
    message,
    priority: 2,
  }, (id) => {
    if (chrome.runtime.lastError) {
      // Notification permission not granted — non-fatal
      console.warn('[NexusID] Could not create notification:', chrome.runtime.lastError.message);
    } else {
      // Auto-clear after 8 seconds
      setTimeout(() => chrome.notifications.clear(id, () => {}), 8000);
    }
  });
}

// ─── TAB MESSAGING ────────────────────────────────────────────────────────────

/**
 * Sends a message to a content script in a specific tab.
 * Fails silently if the tab no longer exists or has navigated away.
 *
 * @param {number|null} tabId
 * @param {object} message
 */
async function notifyTab(tabId, message) {
  if (!tabId) {
    console.warn('[NexusID] notifyTab called with null tabId — skipping.');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    // Tab may have been closed or navigated — this is expected and non-fatal
    console.warn(`[NexusID] Could not message tab ${tabId}:`, err.message);
  }
}

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────

/**
 * Persists a new verification entry to chrome.storage.local.
 *
 * @param {string} key
 * @param {object} entry
 */
async function setStorageEntry(key, entry) {
  await chrome.storage.local.set({ [key]: entry });
}

/**
 * Retrieves a single entry from chrome.storage.local.
 *
 * @param {string} key
 * @returns {Promise<object|null>}
 */
async function getStorageEntry(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

/**
 * Merges updated fields into an existing storage entry.
 * No-ops if the entry doesn't exist.
 *
 * @param {string} key
 * @param {object} updates
 */
async function updateStorageEntry(key, updates) {
  const existing = await getStorageEntry(key);
  if (!existing) return;
  await chrome.storage.local.set({ [key]: { ...existing, ...updates } });
}

// ─── CLEANUP ──────────────────────────────────────────────────────────────────

/**
 * Removes storage entries older than STORAGE_TTL_MS (1 hour).
 * Called on service worker activation to prevent unbounded storage growth.
 */
async function cleanupStaleEntries() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const keysToRemove = [];

  for (const [key, entry] of Object.entries(all)) {
    if (!isVerificationEntry(entry)) continue;
    if (now - entry.created_at > STORAGE_TTL_MS) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
    console.log(`[NexusID] Cleaned up ${keysToRemove.length} stale storage entries.`);
  }
}

/**
 * Finds any 'pending' entries left in storage from a previous service worker
 * session (where the polling interval was lost on termination) and marks them
 * as expired. This prevents a user from seeing a permanently-stuck "pending" UI.
 */
async function recoverOrphanedRequests() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();

  for (const [key, entry] of Object.entries(all)) {
    if (!isVerificationEntry(entry)) continue;
    if (entry.status !== 'pending') continue;

    // If still within TTL, try to resume polling
    const age = now - entry.created_at;
    if (age < STORAGE_TTL_MS) {
      console.log(`[NexusID] Recovering orphaned request ${key} (age: ${Math.round(age / 1000)}s)`);

      // How many attempts have already elapsed?
      const elapsedAttempts = Math.floor(age / POLL_INTERVAL_MS);
      const remainingAttempts = MAX_POLL_ATTEMPTS - elapsedAttempts;

      if (remainingAttempts <= 0) {
        // Already timed out — mark as expired
        await updateStorageEntry(key, { status: 'expired', updated_at: now });
        await notifyTab(entry.tab_id, { type: 'VERIFICATION_EXPIRED' });
      } else {
        // Resume polling with reduced attempt budget
        activePolls.set(key, { attempts: elapsedAttempts });
        startPolling(key, entry.backend_id, entry.tab_id);
      }
    } else {
      // Beyond TTL — mark as expired
      await updateStorageEntry(key, { status: 'expired', updated_at: now });
    }
  }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

/**
 * Type guard — checks whether a chrome.storage.local value is a NexusID
 * verification entry (vs arbitrary extension storage from other features).
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
function isVerificationEntry(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.local_id === 'string' &&
    typeof entry.verifier_id === 'string' &&
    typeof entry.created_at === 'number' &&
    typeof entry.status === 'string'
  );
}

/**
 * fetch() with an AbortController-based timeout.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── NOTIFICATION CLICK HANDLER ───────────────────────────────────────────────

/**
 * When the user clicks a NexusID notification, open the dashboard.
 */
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('nexusid-')) {
    chrome.tabs.create({ url: 'http://localhost:3000/dashboard' });
    chrome.notifications.clear(notificationId, () => {});
  }
});
