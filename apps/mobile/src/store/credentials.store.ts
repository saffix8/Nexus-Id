import { create } from 'zustand';
import type { SDJWTCredential } from '@nexusid/types';
import { getStorage } from '../lib/storage';
import { errorMessage } from '../lib/wallet';

interface CredentialsState {
  credentials: SDJWTCredential[];
  /** Credential ids the issuer has revoked (GET /credentials/:id/revocation). */
  revoked: ReadonlySet<string>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

interface CredentialsActions {
  loadCredentials: () => Promise<void>;
  addCredential: (credential: SDJWTCredential) => Promise<void>;
  removeCredential: (id: string) => Promise<void>;
  refreshRevocation: () => Promise<void>;
}

export const useCredentialsStore = create<CredentialsState & CredentialsActions>()((set, get) => ({
  credentials: [],
  revoked: new Set<string>(),
  loaded: false,
  loading: false,
  error: null,

  async loadCredentials() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const db = await getStorage();
      const credentials = await db.getAllCredentials();
      set({ credentials, loading: false, loaded: true });
      void get().refreshRevocation();
    } catch (err) {
      set({ error: errorMessage(err, 'Could not open the encrypted wallet on this device.'), loading: false, loaded: true });
    }
  },

  async addCredential(credential) {
    const db = await getStorage();
    await db.saveCredential(credential);
    set(state => ({ credentials: [...state.credentials.filter(c => c.id !== credential.id), credential] }));
  },

  async removeCredential(id) {
    const db = await getStorage();
    await db.deleteCredential(id);
    set(state => ({ credentials: state.credentials.filter(c => c.id !== id) }));
  },

  async refreshRevocation() {
    const { apiService } = await import('../services/api.service');
    const revoked = new Set<string>();
    await Promise.all(
      get().credentials.map(async c => {
        try {
          const r = await apiService.checkRevocation(c.id);
          if (r.revoked || r.status === 'revoked') revoked.add(c.id);
        } catch {
          // Offline or unknown to the backend — keep showing the local status.
        }
      }),
    );
    set({ revoked });
  },
}));
