// Lock screen (FR-015): biometric prompt opens automatically before the wallet is shown.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { authenticate } from '../lib/biometric';
import { useAuthStore } from '../store/auth.store';
import { useSessionStore } from '../store/session.store';
import { colors, space } from '../styles/tokens';
import { Button, Logo, Screen, Text } from '../ui';

export function LockScreen() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const email = useAuthStore(s => s.email);
  const started = useRef(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await authenticate('Unlock NexusID');
    setBusy(false);
    if (r.ok) useSessionStore.getState().setUnlocked(true);
    else setError(r.reason === 'cancelled' ? null : r.message);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = setTimeout(unlock, 300); // let the screen paint before the system prompt
    return () => clearTimeout(t);
  }, [unlock]);

  return (
    <Screen style={s.wrap}>
      <View style={s.top}>
        <Logo size={72} />
        <Text variant="pageTitle" align="center">
          Unlock NexusID
        </Text>
        {email ? (
          <Text variant="bodySmall" align="center">
            {email}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: space[3], alignSelf: 'stretch' }}>
        {error ? (
          <Text variant="bodySmall" color={colors.danger} align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button label="Unlock with fingerprint" Icon={Fingerprint} onPress={unlock} loading={busy} />
        <Button label="Sign out" variant="ghost" onPress={() => useAuthStore.getState().logout()} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space.page, justifyContent: 'space-between' },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
});
