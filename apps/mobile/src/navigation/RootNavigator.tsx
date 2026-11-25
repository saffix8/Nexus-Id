// Root: Sign in → Lock (FR-015) → app. Polls pending requests while unlocked
// and opens SCR-008 for a new one (stand-in for FCM push, FR-019).
import React, { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { apiService, apiEvents } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';
import { useSessionStore } from '../store/session.store';
import { colors, timing } from '../styles/tokens';
import { navigationRef } from './navigationRef';
import { ScanFab, TabBar } from './TabBar';
import type { RootStackParamList, TabParamList } from './types';
import { SignInScreen } from '../screens/SignInScreen';
import { LockScreen } from '../screens/LockScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { CredentialDetailScreen } from '../screens/CredentialDetailScreen';
import { AddCredentialScreen } from '../screens/AddCredentialScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { RequestScreen } from '../screens/RequestScreen';
import { ProofScreen } from '../screens/ProofScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

/** Re-lock after this long in the background. */
const RELOCK_AFTER_MS = 30_000;

function Tabs() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tab.Navigator tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
        <Tab.Screen name="Wallet" component={WalletScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
      <ScanFab />
    </View>
  );
}

function usePendingPoller(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let active = AppState.currentState === 'active';
    let cancelled = false;

    const poll = async () => {
      if (!active || cancelled) return;
      try {
        const rows = await apiService.getPendingRequests();
        if (cancelled) return;
        const session = useSessionStore.getState();
        session.setPending(rows);
        const fresh = rows.find(r => !session.seen.has(r.requestId) && Date.parse(r.expiresAt) > Date.now());
        const current = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
        if (fresh && current !== 'Request' && current !== 'Proof') {
          session.markSeen(fresh.requestId);
          navigationRef.navigate('Request', { requestId: fresh.requestId });
        }
      } catch {
        // Offline — the next tick retries.
      }
    };

    void poll();
    const t = setInterval(poll, timing.pollPendingMs);
    const sub = AppState.addEventListener('change', st => {
      active = st === 'active';
      if (active) void poll();
    });
    return () => {
      cancelled = true;
      clearInterval(t);
      sub.remove();
    };
  }, [enabled]);
}

function useAutoLock(enabled: boolean) {
  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', st => {
      if (st === 'background') backgroundedAt.current = Date.now();
      else if (st === 'active' && backgroundedAt.current) {
        if (Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) useSessionStore.getState().setUnlocked(false);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);
}

export function RootNavigator() {
  const signedIn = useAuthStore(s => s.isAuthenticated);
  const unlocked = useSessionStore(s => s.unlocked);

  useEffect(() => {
    // 401 from the backend → session gone; back to sign-in.
    const onLogout = () => useAuthStore.getState().logout();
    apiEvents.on('logout', onLogout);
    return () => {
      apiEvents.off('logout', onLogout);
    };
  }, []);

  usePendingPoller(signedIn && unlocked);
  useAutoLock(signedIn && unlocked);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      {!signedIn ? (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'fade' }} />
      ) : !unlocked ? (
        <Stack.Screen name="Lock" component={LockScreen} options={{ animation: 'fade' }} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="CredentialDetail" component={CredentialDetailScreen} />
          <Stack.Screen name="AddCredential" component={AddCredentialScreen} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen
            name="Request"
            component={RequestScreen}
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' }, gestureEnabled: false }}
          />
          <Stack.Screen name="Proof" component={ProofScreen} options={{ animation: 'fade', gestureEnabled: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
