import { create } from 'zustand';
import { apiService, type HistoryRecordDTO } from '../services/api.service';
import { errorMessage } from '../lib/wallet';

interface HistoryState {
  records: HistoryRecordDTO[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  remove: (requestId: string) => Promise<void>;
  clear: () => Promise<void>;
}

/** SCR-010 — history from API-038 (outcomes only; no claim values exist to show). */
export const useHistoryStore = create<HistoryState>()((set, get) => ({
  records: [],
  loaded: false,
  loading: false,
  error: null,
  async load() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const records = await apiService.getHistory();
      set({ records, loading: false, loaded: true });
    } catch (err) {
      set({ error: errorMessage(err, 'Could not load your history.'), loading: false, loaded: true });
    }
  },
  async remove(requestId) {
    await apiService.deleteHistoryEntry(requestId);
    set(s => ({ records: s.records.filter(r => r.requestId !== requestId) }));
  },
  async clear() {
    await apiService.clearHistory();
    set({ records: [] });
  },
}));
