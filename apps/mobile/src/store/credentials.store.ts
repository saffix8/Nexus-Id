import { create } from 'zustand';
import type { SDJWTCredential } from '@nexusid/types';

interface CredentialsState {
  credentials: SDJWTCredential[];
  loading: boolean;
  error: string | null;
}

interface CredentialsActions {
  loadCredentials: () => Promise<void>;
  addCredential: (credential: SDJWTCredential) => Promise<void>;
  removeCredential: (id: string) => Promise<void>;
  refreshCredentials: () => Promise<void>;
}

type CredentialsStore = CredentialsState & CredentialsActions;

export const useCredentialsStore = create<CredentialsStore>()((set, get) => ({
  credentials: [],
  loading: false,
  error: null,

  async loadCredentials() {
    // Guard: don't double-fetch if already loading
    if (get().loading) return;

    set({ loading: true, error: null });
    try {
      const { StorageService } = await import('../services/storage.service');
      const db = StorageService.getInstance();
      const credentials = await db.getAllCredentials();
      set({ credentials, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load credentials';
      set({ error: message, loading: false });
      console.error('[CredentialsStore] loadCredentials failed:', err);
    }
  },

  async addCredential(credential) {
    set({ loading: true, error: null });
    try {
      const { StorageService } = await import('../services/storage.service');
      const db = StorageService.getInstance();
      await db.saveCredential(credential);
      // Optimistic update — append immediately without re-fetching
      set((state) => ({
        credentials: [...state.credentials, credential],
        loading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save credential';
      set({ error: message, loading: false });
      console.error('[CredentialsStore] addCredential failed:', err);
      throw err; // Re-throw so callers (screens) can show error UI
    }
  },

  async removeCredential(id) {
    set({ loading: true, error: null });
    try {
      const { StorageService } = await import('../services/storage.service');
      const db = StorageService.getInstance();
      await db.deleteCredential(id);
      // Remove from local state immediately
      set((state) => ({
        credentials: state.credentials.filter((c) => c.id !== id),
        loading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete credential';
      set({ error: message, loading: false });
      console.error('[CredentialsStore] removeCredential failed:', err);
      throw err;
    }
  },

  async refreshCredentials() {
    // Force re-fetch regardless of loading state
    set({ loading: true, error: null });
    try {
      const { StorageService } = await import('../services/storage.service');
      const db = StorageService.getInstance();
      const credentials = await db.getAllCredentials();
      set({ credentials, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh credentials';
      set({ error: message, loading: false });
      console.error('[CredentialsStore] refreshCredentials failed:', err);
    }
  },
}));
