import { create } from 'zustand';
// These local types mirror what StorageService uses internally.
// They are defined here (and re-exported from storage.service.ts) to avoid
// circular import chains when screens import from the store directly.

export interface PendingVerification {
  id: string;
  verifier_id: string;
  verifier_name: string | null;
  requested_fields: string[];
  nonce: string;
  expires_at: string;   // ISO timestamp
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  received_at: string;  // ISO timestamp
}

export interface VerificationHistoryRecord {
  id: string;
  credential_id: string;
  verifier_id: string;
  verifier_name: string | null;
  disclosed_fields: string[];   // field names only — no values in history
  timestamp: string;            // ISO timestamp
  status: 'completed' | 'rejected' | 'failed';
}

interface VerificationState {
  pendingRequest: PendingVerification | null;
  history: VerificationHistoryRecord[];
  loading: boolean;
}

interface VerificationActions {
  setPendingRequest: (request: PendingVerification | null) => void;
  loadHistory: () => Promise<void>;
  addHistoryRecord: (record: VerificationHistoryRecord) => void;
  clearPending: () => void;
}

type VerificationStore = VerificationState & VerificationActions;

export const useVerificationStore = create<VerificationStore>()((set, get) => ({
  pendingRequest: null,
  history: [],
  loading: false,

  setPendingRequest(request) {
    set({ pendingRequest: request });
  },

  async loadHistory() {
    if (get().loading) return;

    set({ loading: true });
    try {
      const { StorageService } = await import('../services/storage.service');
      const db = StorageService.getInstance();
      const history = await db.getVerificationHistory();
      set({ history, loading: false });
    } catch (err) {
      set({ loading: false });
      console.error('[VerificationStore] loadHistory failed:', err);
    }
  },

  addHistoryRecord(record) {
    // Prepend so most recent is always first
    set((state) => ({ history: [record, ...state.history] }));
  },

  clearPending() {
    set({ pendingRequest: null });
  },
}));
