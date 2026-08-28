/**
 * NexusID — Content Script
 * Detects <div id="nexusid-verify"> elements and orchestrates the verification flow.
 * Manifest V3 — vanilla JS, no imports, inline styles only.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

var NEXUSID_TARGET_ID = 'nexusid-verify';
var PROCESSED_FLAG    = 'nexusidProcessed';

// Map of requestId → element, so background messages can find the right div.
var activeRequests = {};

// ─── Keyframe injection (once per page) ───────────────────────────────────────

(function injectKeyframes() {
  if (document.getElementById('nexusid-keyframes')) return;
  var style = document.createElement('style');
  style.id = 'nexusid-keyframes';
  style.textContent = [
    '@keyframes nexusid-spin {',
    '  0%   { transform: rotate(0deg); }',
    '  100% { transform: rotate(360deg); }',
    '}',
    '@keyframes nexusid-pulse {',
    '  0%, 100% { opacity: 1; }',
    '  50%       { opacity: 0.5; }',
    '}',
    '@keyframes nexusid-fadein {',
    '  from { opacity: 0; transform: translateY(4px); }',
    '  to   { opacity: 1; transform: translateY(0); }',
    '}',
    '@keyframes nexusid-draw {',
    '  from { stroke-dashoffset: 60; }',
    '  to   { stroke-dashoffset: 0; }',
    '}',
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);
})();

// ─── Style helpers ────────────────────────────────────────────────────────────

function applyStyles(el, styles) {
  Object.assign(el.style, styles);
}

var BASE_WRAPPER = {
  fontFamily:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  borderRadius:  '12px',
  padding:       '20px 24px',
  boxSizing:     'border-box',
  animation:     'nexusid-fadein 0.25s ease-out',
  overflow:      'hidden',
  position:      'relative',
};

// ─── UI Builders ──────────────────────────────────────────────────────────────

/**
 * Shared header row: NexusID wordmark + status badge.
 */
function buildHeader(badgeText, badgeColor, badgeBg) {
  var header = document.createElement('div');
  applyStyles(header, {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   '14px',
  });

  // Wordmark
  var wordmark = document.createElement('span');
  applyStyles(wordmark, {
    fontWeight:    '700',
    fontSize:      '15px',
    letterSpacing: '-0.01em',
    color:         '#3B6FE8',
  });
  wordmark.textContent = 'NexusID';

  // Badge
  var badge = document.createElement('span');
  applyStyles(badge, {
    fontSize:      '10px',
    fontWeight:    '600',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color:         badgeColor,
    background:    badgeBg,
    border:        '1px solid ' + badgeColor + '40',
    borderRadius:  '4px',
    padding:       '3px 8px',
  });
  badge.textContent = badgeText;

  header.appendChild(wordmark);
  header.appendChild(badge);
  return header;
}

/**
 * Divider line.
 */
function buildDivider(color) {
  var div = document.createElement('div');
  applyStyles(div, {
    height:       '1px',
    background:   color || '#E5E7EB',
    margin:       '14px 0',
    opacity:      '0.6',
  });
  return div;
}

// ── 1. PENDING UI ─────────────────────────────────────────────────────────────

function buildPendingUI(verifierName, requestedFields) {
  var wrapper = document.createElement('div');
  applyStyles(wrapper, Object.assign({}, BASE_WRAPPER, {
    background:   '#FFFBEB',
    border:       '1px solid #F59E0B',
    boxShadow:    '0 2px 12px rgba(245,158,11,0.12)',
  }));

  wrapper.appendChild(buildHeader('Pending', '#B45309', '#FEF3C7'));
  wrapper.appendChild(buildDivider('#F59E0B'));

  // Spinner row
  var spinnerRow = document.createElement('div');
  applyStyles(spinnerRow, {
    display:     'flex',
    alignItems:  'center',
    gap:         '14px',
    marginBottom:'12px',
  });

  var spinner = document.createElement('div');
  applyStyles(spinner, {
    width:        '28px',
    height:       '28px',
    minWidth:     '28px',
    border:       '2.5px solid #FDE68A',
    borderTop:    '2.5px solid #F59E0B',
    borderRadius: '50%',
    animation:    'nexusid-spin 0.8s linear infinite',
  });

  var textCol = document.createElement('div');

  var heading = document.createElement('p');
  applyStyles(heading, {
    margin:     '0 0 3px',
    fontWeight: '700',
    fontSize:   '14px',
    color:      '#78350F',
  });
  heading.textContent = 'Verification Requested';

  var sub = document.createElement('p');
  applyStyles(sub, {
    margin:     '0',
    fontSize:   '12px',
    color:      '#92400E',
    lineHeight: '1.4',
  });
  sub.textContent = 'Check your phone to approve this request';

  textCol.appendChild(heading);
  textCol.appendChild(sub);
  spinnerRow.appendChild(spinner);
  spinnerRow.appendChild(textCol);
  wrapper.appendChild(spinnerRow);

  // Verifier + fields summary
  if (verifierName || (requestedFields && requestedFields.length)) {
    var meta = document.createElement('div');
    applyStyles(meta, {
      background:   '#FEF3C7',
      borderRadius: '8px',
      padding:      '10px 12px',
      fontSize:     '12px',
      color:        '#78350F',
      lineHeight:   '1.6',
    });

    if (verifierName) {
      var vRow = document.createElement('div');
      applyStyles(vRow, { marginBottom: requestedFields && requestedFields.length ? '4px' : '0' });
      vRow.innerHTML = '<strong>Verifier:</strong> ' + escapeHtml(verifierName);
      meta.appendChild(vRow);
    }

    if (requestedFields && requestedFields.length) {
      var fRow = document.createElement('div');
      fRow.innerHTML = '<strong>Requesting:</strong> ' +
        requestedFields.map(function(f) { return escapeHtml(formatFieldName(f)); }).join(', ');
      meta.appendChild(fRow);
    }

    wrapper.appendChild(meta);
  }

  return wrapper;
}

// ── 2. SUCCESS UI ─────────────────────────────────────────────────────────────

function buildSuccessUI(verifiedFields) {
  var wrapper = document.createElement('div');
  applyStyles(wrapper, Object.assign({}, BASE_WRAPPER, {
    background: '#F0FDF4',
    border:     '1px solid #22C55E',
    boxShadow:  '0 2px 12px rgba(34,197,94,0.12)',
  }));

  wrapper.appendChild(buildHeader('Verified', '#15803D', '#DCFCE7'));
  wrapper.appendChild(buildDivider('#22C55E'));

  // Animated checkmark + heading
  var checkRow = document.createElement('div');
  applyStyles(checkRow, {
    display:     'flex',
    alignItems:  'center',
    gap:         '12px',
    marginBottom:'14px',
  });

  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width',   '32');
  svg.setAttribute('height',  '32');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('fill',    'none');

  var circle = document.createElementNS(svgNS, 'circle');
  circle.setAttribute('cx', '16');
  circle.setAttribute('cy', '16');
  circle.setAttribute('r',  '15');
  circle.setAttribute('fill', '#DCFCE7');
  circle.setAttribute('stroke', '#22C55E');
  circle.setAttribute('stroke-width', '1.5');

  var check = document.createElementNS(svgNS, 'polyline');
  check.setAttribute('points', '9,17 14,22 23,11');
  check.setAttribute('stroke', '#16A34A');
  check.setAttribute('stroke-width', '2.5');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');
  check.setAttribute('stroke-dasharray', '60');
  check.setAttribute('stroke-dashoffset', '60');
  applyStyles(check, { animation: 'nexusid-draw 0.4s 0.1s ease-out forwards' });

  svg.appendChild(circle);
  svg.appendChild(check);

  var textCol = document.createElement('div');

  var heading = document.createElement('p');
  applyStyles(heading, { margin: '0 0 2px', fontWeight: '700', fontSize: '15px', color: '#14532D' });
  heading.textContent = 'Identity Verified';

  var sub = document.createElement('p');
  applyStyles(sub, { margin: '0', fontSize: '12px', color: '#166534' });
  sub.textContent = 'The following information was confirmed';

  textCol.appendChild(heading);
  textCol.appendChild(sub);
  checkRow.appendChild(svg);
  checkRow.appendChild(textCol);
  wrapper.appendChild(checkRow);

  // Verified fields grid
  if (verifiedFields && Object.keys(verifiedFields).length > 0) {
    var grid = document.createElement('div');
    applyStyles(grid, {
      background:   '#DCFCE7',
      borderRadius: '8px',
      padding:      '10px 12px',
      display:      'grid',
      gap:          '6px',
    });

    Object.keys(verifiedFields).forEach(function(key) {
      var row = document.createElement('div');
      applyStyles(row, { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px' });

      var label = document.createElement('span');
      applyStyles(label, { color: '#166534', fontWeight: '600', textTransform: 'capitalize' });
      label.textContent = formatFieldName(key);

      var value = document.createElement('span');
      applyStyles(value, { color: '#14532D', textAlign: 'right', wordBreak: 'break-word' });
      value.textContent = String(verifiedFields[key]);

      row.appendChild(label);
      row.appendChild(value);
      grid.appendChild(row);
    });

    wrapper.appendChild(grid);
  }

  // Powered by footer
  var footer = buildFooter();
  wrapper.appendChild(footer);

  return wrapper;
}

// ── 3. REJECTED UI ────────────────────────────────────────────────────────────

function buildRejectedUI() {
  var wrapper = document.createElement('div');
  applyStyles(wrapper, Object.assign({}, BASE_WRAPPER, {
    background: '#FFF1F2',
    border:     '1px solid #EF4444',
    boxShadow:  '0 2px 12px rgba(239,68,68,0.10)',
  }));

  wrapper.appendChild(buildHeader('Rejected', '#B91C1C', '#FEE2E2'));
  wrapper.appendChild(buildDivider('#EF4444'));

  var row = document.createElement('div');
  applyStyles(row, { display: 'flex', alignItems: 'center', gap: '12px' });

  // X icon
  var iconBox = document.createElement('div');
  applyStyles(iconBox, {
    width:         '32px',
    height:        '32px',
    minWidth:      '32px',
    borderRadius:  '50%',
    background:    '#FEE2E2',
    border:        '1.5px solid #EF4444',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    fontSize:      '16px',
  });
  iconBox.textContent = '✕';

  var textCol = document.createElement('div');

  var heading = document.createElement('p');
  applyStyles(heading, { margin: '0 0 2px', fontWeight: '700', fontSize: '14px', color: '#7F1D1D' });
  heading.textContent = 'Verification Rejected';

  var sub = document.createElement('p');
  applyStyles(sub, { margin: '0', fontSize: '12px', color: '#991B1B', lineHeight: '1.4' });
  sub.textContent = 'The user declined to share their information.';

  textCol.appendChild(heading);
  textCol.appendChild(sub);
  row.appendChild(iconBox);
  row.appendChild(textCol);
  wrapper.appendChild(row);

  return wrapper;
}

// ── 4. EXPIRED UI ─────────────────────────────────────────────────────────────

function buildExpiredUI(onRetry) {
  var wrapper = document.createElement('div');
  applyStyles(wrapper, Object.assign({}, BASE_WRAPPER, {
    background: '#F9FAFB',
    border:     '1px solid #9CA3AF',
    boxShadow:  '0 2px 8px rgba(0,0,0,0.06)',
  }));

  wrapper.appendChild(buildHeader('Expired', '#4B5563', '#F3F4F6'));
  wrapper.appendChild(buildDivider('#D1D5DB'));

  var row = document.createElement('div');
  applyStyles(row, {
    display:      'flex',
    alignItems:   'center',
    gap:          '12px',
    marginBottom: '14px',
  });

  var iconBox = document.createElement('div');
  applyStyles(iconBox, {
    width:         '32px',
    height:        '32px',
    minWidth:      '32px',
    borderRadius:  '50%',
    background:    '#E5E7EB',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    fontSize:      '16px',
  });
  iconBox.textContent = '⏱';

  var textCol = document.createElement('div');

  var heading = document.createElement('p');
  applyStyles(heading, { margin: '0 0 2px', fontWeight: '700', fontSize: '14px', color: '#111827' });
  heading.textContent = 'Request Expired';

  var sub = document.createElement('p');
  applyStyles(sub, { margin: '0', fontSize: '12px', color: '#6B7280', lineHeight: '1.4' });
  sub.textContent = 'The verification window has closed. Please try again.';

  textCol.appendChild(heading);
  textCol.appendChild(sub);
  row.appendChild(iconBox);
  row.appendChild(textCol);
  wrapper.appendChild(row);

  // Retry button
  if (typeof onRetry === 'function') {
    var btn = document.createElement('button');
    applyStyles(btn, {
      display:       'inline-flex',
      alignItems:    'center',
      gap:           '6px',
      padding:       '8px 16px',
      background:    'transparent',
      border:        '1px solid #D1D5DB',
      borderRadius:  '8px',
      fontSize:      '13px',
      fontWeight:    '600',
      color:         '#374151',
      cursor:        'pointer',
      fontFamily:    'inherit',
      transition:    'background 0.15s',
    });
    btn.textContent = '↺  Request again';
    btn.addEventListener('mouseover', function() { btn.style.background = '#F3F4F6'; });
    btn.addEventListener('mouseout',  function() { btn.style.background = 'transparent'; });
    btn.addEventListener('click',     onRetry);
    wrapper.appendChild(btn);
  }

  return wrapper;
}

// ── 5. ERROR UI ───────────────────────────────────────────────────────────────

function buildErrorUI(errorMessage) {
  var wrapper = document.createElement('div');
  applyStyles(wrapper, Object.assign({}, BASE_WRAPPER, {
    background: '#FFF1F2',
    border:     '1px solid #EF4444',
    boxShadow:  '0 2px 12px rgba(239,68,68,0.10)',
  }));

  wrapper.appendChild(buildHeader('Error', '#B91C1C', '#FEE2E2'));
  wrapper.appendChild(buildDivider('#EF4444'));

  var row = document.createElement('div');
  applyStyles(row, { display: 'flex', alignItems: 'flex-start', gap: '12px' });

  var iconBox = document.createElement('div');
  applyStyles(iconBox, {
    width:         '32px',
    height:        '32px',
    minWidth:      '32px',
    borderRadius:  '50%',
    background:    '#FEE2E2',
    border:        '1.5px solid #EF4444',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    fontSize:      '14px',
    marginTop:     '1px',
  });
  iconBox.textContent = '⚠';

  var textCol = document.createElement('div');

  var heading = document.createElement('p');
  applyStyles(heading, { margin: '0 0 4px', fontWeight: '700', fontSize: '14px', color: '#7F1D1D' });
  heading.textContent = 'Verification Failed';

  var msg = document.createElement('p');
  applyStyles(msg, {
    margin:     '0',
    fontSize:   '12px',
    color:      '#991B1B',
    lineHeight: '1.5',
    wordBreak:  'break-word',
  });
  msg.textContent = errorMessage || 'An unexpected error occurred. Please refresh the page and try again.';

  textCol.appendChild(heading);
  textCol.appendChild(msg);
  row.appendChild(iconBox);
  row.appendChild(textCol);
  wrapper.appendChild(row);

  return wrapper;
}

// ── 6. VALIDATION ERROR UI ────────────────────────────────────────────────────

function buildValidationErrorUI(missingFields) {
  var wrapper = document.createElement('div');
  applyStyles(wrapper, Object.assign({}, BASE_WRAPPER, {
    background: '#FFF7ED',
    border:     '1px solid #F59E0B',
    boxShadow:  '0 2px 8px rgba(245,158,11,0.10)',
  }));

  wrapper.appendChild(buildHeader('Config Error', '#B45309', '#FEF3C7'));
  wrapper.appendChild(buildDivider('#F59E0B'));

  var msg = document.createElement('p');
  applyStyles(msg, { margin: '0 0 8px', fontSize: '13px', color: '#78350F', fontWeight: '600' });
  msg.textContent = 'NexusID widget is misconfigured.';

  var detail = document.createElement('p');
  applyStyles(detail, { margin: '0', fontSize: '12px', color: '#92400E', lineHeight: '1.5' });
  detail.textContent = 'Missing required attributes: ' + missingFields.join(', ');

  wrapper.appendChild(msg);
  wrapper.appendChild(detail);

  return wrapper;
}

// ── Shared footer ─────────────────────────────────────────────────────────────

function buildFooter() {
  var footer = document.createElement('div');
  applyStyles(footer, {
    marginTop:   '12px',
    paddingTop:  '10px',
    borderTop:   '1px solid #D1FAE5',
    display:     'flex',
    alignItems:  'center',
    gap:         '4px',
    fontSize:    '10px',
    color:       '#6B7280',
    fontFamily:  "'JetBrains Mono', 'Courier New', monospace",
    letterSpacing:'0.04em',
  });

  var lock = document.createElement('span');
  lock.textContent = '🔒';
  applyStyles(lock, { fontSize: '10px' });

  var text = document.createElement('span');
  text.textContent = 'Verified with NexusID · SD-JWT · RFC 9901';

  footer.appendChild(lock);
  footer.appendChild(text);
  return footer;
}

// ─── Utility functions ────────────────────────────────────────────────────────

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function formatFieldName(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

/**
 * Replace the content of a container element with a new child,
 * preserving the container's original dimensions if possible.
 */
function replaceContent(container, newChild) {
  while (container.firstChild) { container.removeChild(container.firstChild); }
  container.appendChild(newChild);
}

// ─── Core: process a single nexusid-verify element ───────────────────────────

function processElement(el) {
  // Guard: already processed
  if (el.dataset[PROCESSED_FLAG]) return;
  el.dataset[PROCESSED_FLAG] = 'true';

  // ── Validate attributes ──────────────────────────────────────────────────
  var verifierId   = (el.dataset.verifierId   || '').trim();
  var verifierName = (el.dataset.verifierName  || '').trim();
  var fieldsRaw    = (el.dataset.fields        || '').trim();
  var nonce        = (el.dataset.nonce         || '').trim();
  var callbackUrl  = (el.dataset.callbackUrl   || '').trim();

  var missing = [];
  if (!verifierId)  missing.push('data-verifier-id');
  if (!fieldsRaw)   missing.push('data-fields');
  if (!nonce)       missing.push('data-nonce');

  if (missing.length > 0) {
    replaceContent(el, buildValidationErrorUI(missing));
    return;
  }

  var requestedFields = fieldsRaw.split(',').map(function(f) { return f.trim(); }).filter(Boolean);

  // ── Inject pending UI immediately ────────────────────────────────────────
  replaceContent(el, buildPendingUI(verifierName || verifierId, requestedFields));

  // ── Send to background ───────────────────────────────────────────────────
  var message = {
    type:             'VERIFICATION_REQUEST_DETECTED',
    verifier_id:      verifierId,
    verifier_name:    verifierName || verifierId,
    requested_fields: requestedFields,
    nonce:            nonce,
    callback_url:     callbackUrl || null,
    page_url:         window.location.href,
  };

  try {
    chrome.runtime.sendMessage(message, function(response) {
      // Suppress "message channel closed" errors that occur when the
      // background service worker wakes up mid-send.
      if (chrome.runtime.lastError) {
        console.warn('[NexusID] sendMessage error:', chrome.runtime.lastError.message);
        return;
      }

      if (!response) return;

      if (!response.success) {
        replaceContent(el, buildErrorUI(response.error));
        return;
      }

      // Store the request_id → element mapping for incoming messages
      if (response.request_id) {
        activeRequests[response.request_id] = el;
      }
    });
  } catch (err) {
    console.error('[NexusID] Failed to send message:', err);
    replaceContent(el, buildErrorUI('Could not reach the NexusID extension background. Please reload the page.'));
  }

  // ── Expose a retry function on the element ───────────────────────────────
  el._nexusidRetry = function() {
    // Clear processed flag and re-run
    delete el.dataset[PROCESSED_FLAG];
    Object.keys(activeRequests).forEach(function(id) {
      if (activeRequests[id] === el) { delete activeRequests[id]; }
    });
    processElement(el);
  };
}

// ─── Background → Content message listener ────────────────────────────────────

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (!message || !message.type) return;

  var requestId = message.request_id;
  var el = requestId ? activeRequests[requestId] : null;

  // If we can't find by requestId, fall back to the first active request element
  // (handles cases where background omits the request_id on broadcast).
  if (!el) {
    var ids = Object.keys(activeRequests);
    if (ids.length === 1) { el = activeRequests[ids[0]]; }
  }

  if (!el) return;

  switch (message.type) {

    case 'VERIFICATION_COMPLETE':
      replaceContent(el, buildSuccessUI(message.verified_fields || {}));
      // Clean up
      if (requestId) { delete activeRequests[requestId]; }
      // Redirect if callback URL provided
      if (message.callback_url) {
        setTimeout(function() { window.location.href = message.callback_url; }, 2000);
      }
      break;

    case 'VERIFICATION_REJECTED':
      replaceContent(el, buildRejectedUI());
      if (requestId) { delete activeRequests[requestId]; }
      break;

    case 'VERIFICATION_EXPIRED':
      replaceContent(el, buildExpiredUI(el._nexusidRetry ? el._nexusidRetry.bind(el) : null));
      if (requestId) { delete activeRequests[requestId]; }
      break;

    case 'VERIFICATION_ERROR':
      replaceContent(el, buildErrorUI(message.error));
      if (requestId) { delete activeRequests[requestId]; }
      break;

    default:
      break;
  }

  // Acknowledge
  if (typeof sendResponse === 'function') { sendResponse({ received: true }); }
});

// ─── Detection: scan existing DOM ─────────────────────────────────────────────

function scanDOM(root) {
  var els = (root || document).querySelectorAll('#' + NEXUSID_TARGET_ID);
  Array.prototype.forEach.call(els, processElement);
}

// ─── Detection: MutationObserver for dynamic content ─────────────────────────

var observer = new MutationObserver(function(mutations) {
  for (var i = 0; i < mutations.length; i++) {
    var added = mutations[i].addedNodes;
    for (var j = 0; j < added.length; j++) {
      var node = added[j];
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      // Is the node itself the target?
      if (node.id === NEXUSID_TARGET_ID) {
        processElement(node);
      } else {
        // Or does it contain the target?
        scanDOM(node);
      }
    }
  }
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    scanDOM();
    observer.observe(document.body, { childList: true, subtree: true });
  });
} else {
  // DOM already ready (script injected after load, or document_idle)
  scanDOM();
  observer.observe(document.body, { childList: true, subtree: true });
}
