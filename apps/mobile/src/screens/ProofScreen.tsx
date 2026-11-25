// SCR-009 Proof progress / result (FR-022, FR-026, FR-027) — ProofStepper, then
// a full-screen result.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CircleX, EyeOff } from 'lucide-react-native';
import { ProofStepper } from '../components/ProofStepper';
import { AnimatedCheck } from '../components/AnimatedCheck';
import { predicateSentence, PRIVACY_LINE } from '../lib/copy';
import { buildProof, checkRequest, minDuration, ProofStepError, sendProof, type ProofStep } from '../lib/proof';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/auth.store';
import { useCredentialsStore } from '../store/credentials.store';
import { useHistoryStore } from '../store/history.store';
import { useSessionStore } from '../store/session.store';
import { alpha, colors, space } from '../styles/tokens';
import { useLayout } from '../styles/layout';
import { Button, IconTile, Screen, Text } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Proof'>;

type State = { kind: 'running'; step: ProofStep } | { kind: 'done' } | { kind: 'failed'; step: ProofStep; reason: string };

export function ProofScreen({ route, navigation }: Props) {
  const { requestId, credentialId } = route.params;
  const { compact } = useLayout();
  // Snapshot at mount: the backend drops the request from /pending once answered,
  // and the result screen still needs the verifier and predicate.
  // The request approved on SCR-008 travels with the prepared proof: the poller may already have
  // dropped it from /pending (e.g. it expired while the fingerprint prompt was open).
  const [request] = useState(() => {
    const s = useSessionStore.getState();
    return s.pending.find(p => p.requestId === requestId) ?? (s.prepared?.requestId === requestId ? s.prepared.request : undefined);
  });
  const credential = useCredentialsStore(s => s.credentials.find(c => c.id === credentialId));
  const revoked = useCredentialsStore(s => s.revoked);
  const userId = useAuthStore(s => s.userId);
  const [state, setState] = useState<State>({ kind: 'running', step: 'check' });
  const started = useRef(false);

  const run = useCallback(async () => {
    if (!request || !credential || !userId) {
      setState({ kind: 'failed', step: 'check', reason: 'The request or credential is no longer on this phone.' });
      return;
    }
    if (Date.parse(request.expiresAt) <= Date.now()) {
      setState({ kind: 'failed', step: 'check', reason: 'This request expired before it was approved. Start the check again on the website.' });
      return;
    }
    try {
      // A proof built on Approve (SCR-008) is used once; a retry signs a fresh one.
      const sess0 = useSessionStore.getState();
      const prepared = sess0.prepared?.requestId === requestId ? sess0.prepared.proof : null;
      sess0.setPrepared(null);

      setState({ kind: 'running', step: 'check' });
      await minDuration(async () => checkRequest(request, credential, revoked));
      setState({ kind: 'running', step: 'generate' });
      const proof = await minDuration(async () => prepared ?? (await buildProof(request, credential, userId)));
      setState({ kind: 'running', step: 'send' });
      await minDuration(() => sendProof(request, proof));
      setState({ kind: 'done' });
      const sess = useSessionStore.getState();
      sess.setPending(sess.pending.filter(p => p.requestId !== requestId));
      void useHistoryStore.getState().load();
    } catch (err) {
      const step = err instanceof ProofStepError ? err.step : 'send';
      setState({ kind: 'failed', step, reason: err instanceof Error ? err.message : 'Verification failed.' });
    }
  }, [request, credential, userId, revoked, requestId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const windowOpen = request ? Date.parse(request.expiresAt) > Date.now() : false;
  const verifier = request?.verifierName ?? 'The website';

  if (state.kind === 'done') {
    return (
      <Screen style={s.frame}>
        <View style={s.middle}>
        <AnimatedCheck size={compact ? 96 : 128} />
        <Animated.View entering={FadeInUp.delay(500).duration(250)} style={{ alignItems: 'center', gap: space[3] }}>
          <Text variant="pageTitle" align="center" style={compact ? undefined : { fontSize: 28, lineHeight: 34 }} accessibilityLiveRegion="polite">
            Verified
          </Text>
          <Text variant="body" align="center" color={colors.text} style={{ maxWidth: 320 }}>
            {verifier} now knows {request ? predicateSentence(request.predicate) : 'the answer'}. Nothing else was shared.
          </Text>
          <View style={s.privacy}>
            <EyeOff size={16} color={colors.textMuted} strokeWidth={1.75} />
            <Text variant="bodySmall">{PRIVACY_LINE}</Text>
          </View>
        </Animated.View>
        </View>
        <Button label="Done" onPress={() => navigation.navigate('Tabs', { screen: 'Wallet' })} style={s.bottomBtn} />
      </Screen>
    );
  }

  const failed = state.kind === 'failed';
  return (
    <Screen style={s.frame}>
      <View style={{ flex: 1, justifyContent: 'center', alignSelf: 'stretch', gap: compact ? space[6] : space[8] }}>
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Text variant="eyebrow">{verifier}</Text>
          <Text variant="pageTitle" align="center">
            {failed ? 'Verification failed' : 'Sharing your answer'}
          </Text>
        </View>
        <ProofStepper current={state.step} failed={failed} />
        {failed ? (
          <Animated.View entering={FadeIn.duration(200)} style={s.failCard} accessibilityLiveRegion="polite">
            <IconTile Icon={CircleX} color={colors.danger} size={48} />
            <Text variant="bodySmall" align="center" color={colors.text}>
              {state.reason}
            </Text>
          </Animated.View>
        ) : (
          <Text variant="bodySmall" align="center">
            Your proof is made on this phone. Raw data never leaves it.
          </Text>
        )}
      </View>
      {failed ? (
        <View style={[s.bottomBtn, { gap: space[3] }]}>
          {windowOpen ? <Button label="Retry" onPress={run} /> : null}
          <Button label="Close" variant={windowOpen ? 'ghost' : 'secondary'} onPress={() => navigation.navigate('Tabs', { screen: 'Wallet' })} />
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  // Content centred in the free space; buttons in normal flow below it (never overlapping).
  frame: { padding: space.page, paddingBottom: space[5] },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[6] },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2] },
  bottomBtn: { alignSelf: 'stretch', marginTop: space[4] },
  failCard: {
    alignItems: 'center',
    gap: space[3],
    padding: space[5],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: alpha(colors.danger, 0.25),
    backgroundColor: alpha(colors.danger, 0.08),
  },
});
