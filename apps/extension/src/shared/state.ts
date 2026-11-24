// Shapes persisted in chrome.storage.local and the popup ↔ worker messages.
// The extension never stores credential data or keys: only the pairing token,
// the poll secret of the current request, and its outcome (MOD-7 rules).

export type PairingRecord =
  | {
      status: "pending";
      challengeId: string;
      pairingToken: string;
      qrPayload: string;
      expiresAt: string;
      createdAt: number;
    }
  | {
      status: "paired";
      challengeId: string;
      pairingToken: string;
      deviceName: string | null;
      pairedAt: string | null;
    };

/** Outcome names follow the backend (API-033 `outcome`) and DESIGN.md §3.2. */
export type RequestOutcome =
  "PENDING" | "VERIFIED" | "FAILED" | "DECLINED" | "EXPIRED";

export interface RequestRecord {
  /** Local correlation ID used in content-script messages. */
  localId: string;
  /** Backend session / verification request ID. */
  backendId: string;
  tabId: number | null;
  pageUrl: string;
  /** API-033 poll secret. Removed once the request reaches a final outcome. */
  pollSecret: string | null;
  verifierName: string;
  predicate: string;
  predicateLabel: string;
  outcome: RequestOutcome;
  createdAt: number;
  expiresAt: string;
  decidedAt: string | null;
  /** One-line reason for FAILED (e.g. network or backend message). */
  reason: string | null;
}

export type PopupMessage =
  | { type: "START_PAIRING" }
  | { type: "CHECK_PAIRING" }
  | { type: "UNPAIR" }
  | { type: "POLL_NOW" }
  | { type: "DISMISS_REQUEST" };

export type WorkerReply<T = unknown> =
  { success: true; data: T } | { success: false; error: string };
