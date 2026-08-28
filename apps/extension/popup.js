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
 */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const DASHBOARD_URL = 'http://localhost:3000/dashboard';
const STORAGE_KEY_PREFIX = 'nexusid_vr_'; // storage keys: nexusid_vr_{requestId}

// ── DOM refs ───────────────────────────────────────────────────────────────
const headerBadge          = document.getElementById('header-badge');

const stateIdle            = document.getElementById('state-idle');
const statePending         = document.getElementById('state-pending');
const stateCompleted       = document.getElementById('state-completed');
const stateRejected        = document.getElementById('state-rejected');

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
  [stateIdle, statePending, stateCompleted, stateRejected].forEach(el => {
    el.classList.remove('active');
  });

  /** @type {HTMLElement} */
  const target = {
    idle:      stateIdle,
    pending:   statePending,
    completed: stateCompleted,
    rejected:  stateRejected,
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
    li.innerHTML = `<span class="field-dot"></span>${formatFieldName(field)}`;
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
        <span class="verified-field-key">${formatFieldName(key)}</span>
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
        if (!key.startsWith(STORAGE_KEY_PREFIX)) return;
        const record = items[key];

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
    showState('idle');
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
      showState('idle');
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
      { type: 'CANCEL_VERIFICATION', request_id: record.request_id },
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

  // Only care about NexusID verification records
  const relevantChange = Object.keys(changes).some(k => k.startsWith(STORAGE_KEY_PREFIX));
  if (!relevantChange) return;

  // Re-render with the new data
  refreshUI();
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
    showState('idle');
  }
})();
