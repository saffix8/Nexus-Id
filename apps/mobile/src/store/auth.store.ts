import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// These are imported lazily inside actions to avoid circular deps at module init
// KeystoreService → apps/mobile/src/services/keystore.service.ts
// StorageService  → apps/mobile/src/services/storage.service.ts
// ApiService      → apps/mobile/src/services/api.service.ts

interface AuthState {
  userId: string | null;
  token: string | null;
  publicKey: string | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (userId: string, token: string, publicKey: string) => void;
  logout: () => Promise<void>;
  setPublicKey: (key: string) => void;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  userId: null,
  token: null,
  publicKey: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login(userId, token, publicKey) {
        set({ userId, token, publicKey, isAuthenticated: true });
      },

      async logout() {
        const { userId } = get();

        // Clear keystore key pair
        if (userId) {
          try {
            const { KeystoreService } = await import('../services/keystore.service');
            await KeystoreService.deleteKeyPair(userId);
          } catch (err) {
            // Non-fatal — key may already be gone
            console.warn('[AuthStore] Failed to delete keystore key pair:', err);
          }
        }

        // Clear local SQLite DB
        try {
          const { StorageService } = await import('../services/storage.service');
          const db = StorageService.getInstance();
          // Clear credentials and history — privacy-critical
          await db.clearAllData?.();
        } catch (err) {
          console.warn('[AuthStore] Failed to clear local DB on logout:', err);
        }

        // Clear API token
        try {
          const { ApiService } = await import('../services/api.service');
          await ApiService.getInstance().clearToken();
        } catch (err) {
          console.warn('[AuthStore] Failed to clear API token:', err);
        }

        set(initialState);
      },

      setPublicKey(key) {
        set({ publicKey: key });
      },
    }),
    {
      name: 'nexusid-auth',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the state fields — not actions
      partialize: (state) => ({
        userId: state.userId,
        token: state.token,
        publicKey: state.publicKey,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
