// Sign in (SCR-001 entry) + "Securing your device…" while the Keystore key is made (FR-002).
// Accounts are created on the web portal for the demo; the phone signs in to the same account.
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Fingerprint } from 'lucide-react-native';
import { apiService, AuthError } from '../services/api.service';
import { ensureDeviceKey, jwtSubject } from '../lib/device';
import { errorMessage } from '../lib/wallet';
import { PRIVACY_LINE } from '../lib/copy';
import { useAuthStore } from '../store/auth.store';
import { useSessionStore } from '../store/session.store';
import { alpha, colors, space } from '../styles/tokens';
import { Button, Logo, Screen, Text, TextField } from '../ui';

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'signing-in' | 'securing'>('form');
  const cachedPem = useAuthStore(s => s.publicKey);
  const cachedUser = useAuthStore(s => s.userId);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setPhase('signing-in');
    try {
      const token = await apiService.signIn(email.trim().toLowerCase(), password);
      const userId = jwtSubject(token);
      if (!userId) throw new Error('NexusID returned a session without a user id.');
      setPhase('securing');
      const pem = await ensureDeviceKey(userId, cachedUser === userId ? cachedPem : null);
      useAuthStore.getState().login(userId, token, pem, email.trim().toLowerCase());
      useSessionStore.getState().setUnlocked(true);
    } catch (err) {
      setPhase('form');
      setError(err instanceof AuthError ? 'Invalid email or password.' : errorMessage(err, 'Could not sign in.'));
    }
  }

  if (phase === 'securing') return <SecuringDevice />;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: space[4], marginBottom: space[8] }}>
            <Logo size={64} />
            <Text variant="pageTitle" align="center">
              Sign in to NexusID
            </Text>
            <Text variant="bodySmall" align="center" style={{ maxWidth: 300 }}>
              {PRIVACY_LINE}
            </Text>
          </View>
          <View style={{ gap: space[5] }}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              returnKeyType="next"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="••••••••"
              returnKeyType="go"
              onSubmitEditing={submit}
              error={error}
            />
            <Button label="Sign in" onPress={submit} loading={phase === 'signing-in'} />
            <Text variant="bodySmall" align="center">
              New to NexusID? Create your account on the web portal, then sign in here.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SecuringDevice() {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!reduced) pulse.value = withRepeat(withSequence(withTiming(1.12, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [pulse, reduced]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value * 1.2 }));
  return (
    <Screen style={s.center}>
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 160, height: 160 }}>
        <Animated.View style={[s.ring, ring]} />
        <View style={s.fp}>
          <Fingerprint size={56} color={colors.accentText} strokeWidth={1.5} />
        </View>
      </View>
      <Text variant="pageTitle" align="center" accessibilityLiveRegion="polite">
        Securing your device…
      </Text>
      <Text variant="bodySmall" align="center" style={{ maxWidth: 280 }}>
        Creating your private key inside the Android Keystore. It never leaves this phone.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.page },
  center: { alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space.page },
  ring: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: alpha(colors.accent, 0.5) },
  fp: { width: 104, height: 104, borderRadius: 28, backgroundColor: alpha(colors.accent, 0.12), borderWidth: 1, borderColor: alpha(colors.accent, 0.3), alignItems: 'center', justifyContent: 'center' },
});
