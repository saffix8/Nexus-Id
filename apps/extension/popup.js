/**
 * NexusID — Extension Popup Controller
 *
 * Reads chrome.storage.local for any active verification, renders the
 * correct state panel, and listens for live storage changes.
 *
 * States:
 *   idle      — no active verification
 *   pending   — request created, waiting for phone approval
 *   completed — proof received and verified
 *   rejected  — user rejected on phone (or manually cancelled here)
 *   pairing   — showing the device-pairing QR code (SRS UC-002)
 */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const DASHBOARD_URL = 'http://localhost:3000/dashboard';
const PAIRING_POLL_MS = 2000;

/**
 * background.js stores each verification under its local UUID (no prefix),
 * so recognise records by shape rather than by key.
 */
function isVerificationRecord(record) {
  return (
    record !== null &&
    typeof record === 'object' &&
    typeof record.local_id === 'string' &&
    typeof record.status === 'string'
  );
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const headerBadge          = document.getElementById('header-badge');

const stateIdle            = document.getElementById('state-idle');
const statePending         = document.getElementById('state-pending');
const stateCompleted       = document.getElementById('state-completed');
const stateRejected        = document.getElementById('state-rejected');
const statePairing         = document.getElementById('state-pairing');

const pairingStatusEl      = document.getElementById('pairing-status');
const pairingHintEl        = document.getElementById('pairing-hint');
const pairBtn              = document.getElementById('pair-btn');
const forgetPairingBtn     = document.getElementById('forget-pairing-btn');
const qrFrame              = document.getElementById('qr-frame');
const qrCanvas             = document.getElementById('qr-canvas');
const pairingExpiryEl      = document.getElementById('pairing-expiry');
const pairingErrorEl       = document.getElementById('pairing-error');
const newCodeBtn           = document.getElementById('new-code-btn');
const cancelPairingBtn     = document.getElementById('cancel-pairing-btn');
const copyCodeBtn          = document.getElementById('copy-code-btn');

const pendingVerifierName  = document.getElementById('pending-verifier-name');
const pendingVerifierDomain= document.getElementById('pending-verifier-domain');
const pendingFieldsList    = document.getElementById('pending-fields-list');
const cancelBtn            = document.getElementById('cancel-btn');

const completedVerifierLabel   = document.getElementById('completed-verifier-label');
const verifiedFieldsContainer  = document.getElementById('verified-fields-container');
const completedTimestamp       = document.getElementById('completed-timestamp');

const rejectedSubText      = document.getElementById('rejected-sub-text');
const rejectedVerifierRow  = document.getElementById('rejected-verifier-row');
const rejectedVerifierName = document.getElementById('rejected-verifier-name');

const openDashboardIdle    = document.getElementById('open-dashboard-idle');
const openDashboardFooter  = document.getElementById('open-dashboard-footer');

// ── State rendering ────────────────────────────────────────────────────────

/**
 * Deactivate every panel, then activate the named one.
 * @param {'idle'|'pending'|'completed'|'rejected'} name
 */
function showState(name) {
  [stateIdle, statePending, stateCompleted, stateRejected, statePairing].forEach(el => {
    el.classList.remove('active');
  });

  /** @type {HTMLElement} */
  const target = {
    idle:      stateIdle,
    pending:   statePending,
    completed: stateCompleted,
    rejected:  stateRejected,
    pairing:   statePairing,
  }[name];

  if (target) {
    target.classList.add('active');
  }

  // Update header badge
  const badgeConfig = {
    idle:      { text: 'Idle',      cls: 'idle' },
    pending:   { text: 'Pending',   cls: 'pending' },
    completed: { text: 'Verified',  cls: 'done' },
    rejected:  { text: 'Rejected',  cls: 'rejected' },
    pairing:   { text: 'Pairing',   cls: 'pending' },
  };

  const cfg = badgeConfig[name] || badgeConfig.idle;
  headerBadge.textContent = cfg.text;
  headerBadge.className   = `header-badge ${cfg.cls}`;
}

/**
 * Render the PENDING state UI from a stored verification record.
 * @param {{ verifier_id: string, verifier_name: string, requested_fields: string[], request_id: string }} record
 */
function renderPending(record) {
  pendingVerifierName.textContent   = record.verifier_name || record.verifier_id || 'Unknown Verifier';
  pendingVerifierDomain.textContent = record.verifier_id   || '';

  // Build fields list
  pendingFieldsList.innerHTML = '';
  const fields = Array.isArray(record.requested_fields)
    ? record.requested_fields
    : [];

  fields.forEach(field => {
    const li = document.createElement('li');
    li.className = 'field-item';
    // Field names come from the web page — escape before injecting.
    li.innerHTML = `<span class="field-dot"></span>${escapeHtml(formatFieldName(String(field)))}`;
    pendingFieldsList.appendChild(li);
  });

  showState('pending');
}

/**
 * Render the COMPLETED state UI.
 * @param {{ verifier_name: string, verifier_id: string, verified_fields: Record<string,unknown>, verified_at?: string }} record
 */
function renderCompleted(record) {
  completedVerifierLabel.textContent = `Verified for ${record.verifier_name || record.verifier_id || 'Unknown Verifier'}`;

  // Build verified fields table
  verifiedFieldsContainer.innerHTML = '';
  const fields = record.verified_fields || {};
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    verifiedFieldsContainer.style.display = 'none';
  } else {
    verifiedFieldsContainer.style.display = '';
    entries.forEach(([key, val]) => {
      const row = document.createElement('div');
      row.className = 'verified-field-row';
      row.innerHTML = `
        <span class="verified-field-key">${escapeHtml(formatFieldName(key))}</span>
        <span class="verified-field-value">${escapeHtml(String(val))}</span>
      `;
      verifiedFieldsContainer.appendChild(row);
    });
  }

  // Timestamp
  const ts = record.verified_at ? new Date(record.verified_at) : new Date();
  completedTimestamp.textContent = `Verified at ${formatTime(ts)}`;

  showState('completed');
}

/**
 * Render the REJECTED state UI.
 * @param {{ verifier_name?: string, verifier_id?: string, rejected_at?: string, cancelled?: boolean }} record
 */
function renderRejected(record) {
  if (record.cancelled) {
    rejectedSubText.textContent = 'You cancelled this verification request.';
  } else {
    rejectedSubText.textContent = 'You declined to share your credentials with this verifier.';
  }

  const verifierLabel = record.verifier_name || record.verifier_id;
  if (verifierLabel) {
    rejectedVerifierRow.style.display = 'flex';
    rejectedVerifierName.textContent  = verifierLabel;
  } else {
    rejectedVerifierRow.style.display = 'none';
  }

  showState('rejected');
}

// ── Storage helpers ────────────────────────────────────────────────────────

/**
 * Scan chrome.storage.local for the most recent active verification.
 * Priority: pending > completed > rejected
 * Returns the record or null if nothing active.
 * @returns {Promise<{key: string, record: object} | null>}
 */
async function findActiveVerification() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, items => {
      /** @type {Array<{key: string, record: object}>} */
      const entries = [];

      Object.keys(items).forEach(key => {
        const record = items[key];
        if (!isVerificationRecord(record)) return;

        // Skip entries older than 15 minutes (stale)
        const age = Date.now() - (record.created_at || 0);
        if (age > 15 * 60 * 1000) return;

        entries.push({ key, record });
      });

      if (entries.length === 0) {
        resolve(null);
        return;
      }

      // Sort by created_at descending (most recent first)
      entries.sort((a, b) => (b.record.created_at || 0) - (a.record.created_at || 0));

      // Prefer pending over terminal states
      const pending = entries.find(e => e.record.status === 'pending');
      if (pending) {
        resolve(pending);
        return;
      }

      // Then most recent completed or rejected
      resolve(entries[0]);
    });
  });
}

/**
 * Update the UI based on what's in storage right now.
 */
async function refreshUI() {
  const active = await findActiveVerification();

  if (!active) {
    await renderIdle();
    return;
  }

  const { record } = active;

  switch (record.status) {
    case 'pending':
      renderPending(record);
      break;
    case 'completed':
      renderCompleted(record);
      break;
    case 'rejected':
      renderRejected(record);
      break;
    default:
      await renderIdle();
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────

/**
 * Open the dashboard in a new tab.
 */
function openDashboard(e) {
  e.preventDefault();
  chrome.tabs.create({ url: DASHBOARD_URL });
}

openDashboardIdle.addEventListener('click', openDashboard);
openDashboardFooter.addEventListener('click', openDashboard);

/**
 * Cancel button — sends cancellation to background, clears storage, shows rejected UI.
 */
cancelBtn.addEventListener('click', async () => {
  cancelBtn.disabled  = true;
  cancelBtn.textContent = 'Cancelling…';

  try {
    const active = await findActiveVerification();
    if (!active) {
      showState('idle');
      return;
    }

    const { key, record } = active;

    // Tell background to stop polling
    chrome.runtime.sendMessage(
      { type: 'CANCEL_VERIFICATION', request_id: record.local_id },
      _response => {
        // Ignore errors — even if background is unavailable, we clean up locally
        if (chrome.runtime.lastError) {
          console.warn('[NexusID popup] Cancel message error:', chrome.runtime.lastError.message);
        }
      }
    );

    // Mark as rejected/cancelled in storage
    const updatedRecord = {
      ...record,
      status:     'rejected',
      cancelled:  true,
      rejected_at: new Date().toISOString(),
    };

    await new Promise(resolve => {
      chrome.storage.local.set({ [key]: updatedRecord }, resolve);
    });

    renderRejected(updatedRecord);

  } catch (err) {
    console.error('[NexusID popup] Cancel error:', err);
    showState('idle');
  } finally {
    cancelBtn.disabled    = false;
    cancelBtn.textContent = 'Cancel Request';
  }
});

// ── Live storage listener ──────────────────────────────────────────────────

/**
 * Whenever storage changes (background updates a verification record),
 * re-evaluate and update the popup immediately.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // Only care about NexusID verification records, and never interrupt the
  // pairing screen while a QR code is being scanned.
  const relevantChange = Object.values(changes).some(
    c => isVerificationRecord(c.newValue) || isVerificationRecord(c.oldValue)
  );
  if (!relevantChange || pairingTimers.poll) return;

  // Re-render with the new data
  refreshUI();
});

// ── Device pairing (SRS UC-002, FR-003, FR-024) ─────────────────────────────

const pairingTimers = { poll: null, countdown: null };
let currentQrPayload = null;

function sendToBackground(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { success: false, error: 'No response from background' });
    });
  });
}

/** Idle view: shows whether this browser is paired; resumes an open QR. */
async function renderIdle() {
  showState('idle');

  const res = await sendToBackground({ type: 'CHECK_PAIRING' });
  const state = res.success ? res.data : { status: 'unpaired' };

  if (state.status === 'pending' && state.qr_payload) {
    // A QR code is still waiting to be scanned — show it again.
    showPairingQR(state);
    return;
  }

  renderPairingCard(state);
}

function renderPairingCard(state) {
  if (state.status === 'paired') {
    pairingStatusEl.textContent = '✓ Paired with your NexusID app';
    pairingStatusEl.className = 'pairing-status paired';
    pairingHintEl.textContent = state.paired_at
      ? `Since ${formatTime(new Date(state.paired_at))}. Revoke it from the app or dashboard.`
      : 'Revoke it from the app or dashboard.';
    pairBtn.style.display = 'none';
    forgetPairingBtn.style.display = '';
  } else {
    pairingStatusEl.textContent = 'Not paired with your phone';
    pairingStatusEl.className = 'pairing-status unpaired';
    pairingHintEl.textContent = 'Pair once so verification requests reach your NexusID app.';
    pairBtn.style.display = '';
    forgetPairingBtn.style.display = 'none';
  }
}

/** Draws the QR code onto the canvas with crisp, whole-pixel modules. */
function drawQR(text) {
  const qr = qrcode(0, 'M'); // type 0 = smallest version that fits
  qr.addData(text);
  qr.make();

  const modules = qr.getModuleCount();
  const cell = Math.max(2, Math.floor(180 / modules));
  const size = modules * cell;

  qrCanvas.width = size;
  qrCanvas.height = size;

  const ctx = qrCanvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
}

function stopPairingTimers() {
  clearInterval(pairingTimers.poll);
  clearInterval(pairingTimers.countdown);
  pairingTimers.poll = null;
  pairingTimers.countdown = null;
}

function showPairingExpired() {
  stopPairingTimers();
  qrFrame.classList.add('expired');
  copyCodeBtn.style.display = 'none';
  currentQrPayload = null;
  pairingExpiryEl.textContent = 'Code expired';
  newCodeBtn.style.display = '';
}

function showPairingQR(state) {
  stopPairingTimers();
  showState('pairing');
  pairingErrorEl.style.display = 'none';
  newCodeBtn.style.display = 'none';
  qrFrame.classList.remove('expired');
  copyCodeBtn.style.display = '';
  copyCodeBtn.textContent = 'Copy code instead';
  currentQrPayload = state.qr_payload;
  drawQR(state.qr_payload);

  // BR-002 — visible validity window.
  const expiresAt = new Date(state.expires_at).getTime();
  const tick = () => {
    const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    if (left === 0) {
      showPairingExpired();
      return;
    }
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, '0');
    pairingExpiryEl.textContent = `Expires in ${m}:${s}`;
  };
  tick();
  pairingTimers.countdown = setInterval(tick, 1000);

  // UC-002 step 5 — wait for the phone to claim the code.
  pairingTimers.poll = setInterval(async () => {
    const res = await sendToBackground({ type: 'CHECK_PAIRING' });
    if (!res.success) return;
    if (res.data.status === 'paired') {
      stopPairingTimers();
      await refreshUI();
    } else if (res.data.status === 'expired' || res.data.status === 'unpaired') {
      showPairingExpired();
    }
  }, PAIRING_POLL_MS);
}

async function startPairing() {
  pairBtn.disabled = true;
  newCodeBtn.disabled = true;
  try {
    const res = await sendToBackground({ type: 'START_PAIRING' });
    if (!res.success) {
      showState('pairing');
      qrFrame.classList.add('expired');
      copyCodeBtn.style.display = 'none';
      currentQrPayload = null;
      pairingExpiryEl.textContent = '';
      pairingErrorEl.textContent = res.error || 'Could not start pairing.';
      pairingErrorEl.style.display = '';
      newCodeBtn.style.display = '';
      return;
    }
    showPairingQR(res.data);
  } finally {
    pairBtn.disabled = false;
    newCodeBtn.disabled = false;
  }
}

pairBtn.addEventListener('click', startPairing);

// Same payload as the QR — paste it into Dashboard → Devices to pair from the web.
copyCodeBtn.addEventListener('click', async () => {
  if (!currentQrPayload) return;
  try {
    await navigator.clipboard.writeText(currentQrPayload);
    copyCodeBtn.textContent = 'Copied — paste it in Dashboard → Devices';
  } catch {
    copyCodeBtn.textContent = 'Could not copy';
  }
});
newCodeBtn.addEventListener('click', startPairing);

cancelPairingBtn.addEventListener('click', async () => {
  stopPairingTimers();
  // Drop the unclaimed code locally; it also expires server-side (BR-002).
  const res = await sendToBackground({ type: 'CHECK_PAIRING' });
  if (res.success && res.data.status !== 'paired') {
    await sendToBackground({ type: 'FORGET_PAIRING' });
  }
  await refreshUI();
});

forgetPairingBtn.addEventListener('click', async () => {
  await sendToBackground({ type: 'FORGET_PAIRING' });
  await refreshUI();
});

// ── Formatting utilities ───────────────────────────────────────────────────

/**
 * Convert snake_case field keys to readable labels.
 * e.g. "degree_title" → "Degree Title"
 * @param {string} key
 * @returns {string}
 */
function formatFieldName(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format a Date for display.
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  try {
    return date.toLocaleString(undefined, {
      month:  'short',
      day:    'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

/**
 * Escape HTML special chars before injecting user-controlled strings.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Boot ───────────────────────────────────────────────────────────────────

/**
 * Entry point — called once when popup opens.
 */
(async function init() {
  // Default to idle while we check storage
  showState('idle');

  try {
    await refreshUI();
  } catch (err) {
    console.error('[NexusID popup] Init error:', err);
    await renderIdle();
  }
})();
