import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  userId: string | null;
  email: string | null;
  token: string | null;
  publicKey: string | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (
    userId: string,
    token: string,
    publicKey: string,
    email?: string | null,
  ) => void;
  logout: () => Promise<void>;
  setPublicKey: (key: string) => void;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  userId: null,
  email: null,
  token: null,
  publicKey: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login(userId, token, publicKey, email = null) {
        set({ userId, token, publicKey, email, isAuthenticated: true });
      },

      async logout() {
        const { userId } = get();
        // Unchanged behaviour: sign-out removes this device's Keystore key pair.
        if (userId) {
          try {
            const { keystoreService } =
              await import('../services/keystore.service');
            await keystoreService.deleteKeyPair(userId);
          } catch (err) {
            console.warn(
              '[AuthStore] Failed to delete keystore key pair:',
              err,
            );
          }
        }
        // Credentials are bound (cnf) to the key just deleted — wipe them too.
        try {
          const { storageService } =
            await import('../services/storage.service');
          await storageService.clearAllData();
          const { useCredentialsStore } = await import('./credentials.store');
          useCredentialsStore.setState({
            credentials: [],
            revoked: new Set(),
            loaded: false,
          });
        } catch (err) {
          console.warn(
            '[AuthStore] Failed to clear the credential store:',
            err,
          );
        }
        // Don't show the previous account's history to whoever signs in next.
        const { useHistoryStore } = await import('./history.store');
        useHistoryStore.setState({ records: [], loaded: false, error: null });
        try {
          const { apiService } = await import('../services/api.service');
          await apiService.clearToken();
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
      partialize: state => ({
        userId: state.userId,
        email: state.email,
        token: state.token,
        publicKey: state.publicKey,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
