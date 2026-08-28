/**
 * NexusID Extension Configuration
 *
 * Shared constants used by background.js and popup.js.
 * content.js does NOT import this — it receives config via chrome.runtime.sendMessage
 * from background.js to avoid any module/import complexity in content scripts.
 */

const CONFIG = {
  /** Base URL for the NexusID backend API */
  BACKEND_URL: 'http://localhost:4000/api/v1',

  /** How often to poll for verification result (ms) */
  POLL_INTERVAL_MS: 5000,

  /**
   * Max number of poll attempts before treating the request as expired.
   * 60 attempts × 5000ms = 5 minutes total polling window.
   */
  MAX_POLL_ATTEMPTS: 60,

  /**
   * How long to keep completed/rejected verification records in chrome.storage
   * before automatic cleanup (ms). 1 hour.
   */
  STORAGE_CLEANUP_AGE_MS: 60 * 60 * 1000,

  /** Extension version — must match manifest.json */
  VERSION: '1.0.0',
};

// In Manifest V3, background service workers and popups are separate JS contexts.
// Both files import config.js via <script src="config.js"> (popup.html)
// or importScripts('config.js') (background service worker).
// Therefore CONFIG is exported as a plain global — no ES module syntax.
