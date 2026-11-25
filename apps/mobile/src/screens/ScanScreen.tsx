// SCR-007 Scan QR (FR-003): full-screen camera, rounded cutout with animated
// corners. Pairing signs the challenge with the device key (ALG-007, via
// crypto.service.ts) and redeems it (API-025).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Camera,
  useCameraPermission,
  useObjectOutput,
  type ScannedCode,
  type ScannedObject,
} from 'react-native-vision-camera';
import { Camera as CameraIcon, CircleX, Link2, X } from 'lucide-react-native';
import { apiService, ApiError } from '../services/api.service';
import { parsePairingPayload, type QrPurpose } from '../lib/pairing';
import { useAuthStore } from '../store/auth.store';
import type { RootStackParamList } from '../navigation/types';
import { colors, space } from '../styles/tokens';
import { AnimatedCheck } from '../components/AnimatedCheck';
import { Button, IconButton, IconTile, Screen, Spinner, Text } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

type Phase =
  | { kind: 'scanning' }
  | { kind: 'claiming'; purpose: QrPurpose }
  | { kind: 'paired'; purpose: QrPurpose }
  | { kind: 'error'; message: string };

export function ScanScreen({ navigation }: Props) {
  const { hasPermission, canRequestPermission, requestPermission } =
    useCameraPermission();
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const busy = useRef(false);
  const userId = useAuthStore(s => s.userId);

  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  const handle = useCallback(
    async (raw: string) => {
      if (busy.current) return; // ignore repeat frames
      busy.current = true;
      const payload = parsePairingPayload(raw);
      if (!payload) {
        setPhase({
          kind: 'error',
          message:
            'That QR code is not a NexusID code. Scan the code in the NexusID extension, or the one on the NexusID sign-in page.',
        });
        return;
      }
      if (!userId) {
        setPhase({
          kind: 'error',
          message:
            payload.purpose === 'SIGN_IN'
              ? 'Sign in to the NexusID app first, then scan the code on your computer.'
              : 'Sign in to NexusID before pairing a browser.',
        });
        return;
      }
      setPhase({ kind: 'claiming', purpose: payload.purpose });
      try {
        const { default: cryptoService, SigningError } =
          await import('../services/crypto.service');
        try {
          const signature = await cryptoService.signQrChallenge(
            userId,
            payload.challengeId,
            payload.code,
            payload.purpose,
          );
          await apiService.redeemQrChallenge(
            payload.challengeId,
            payload.code,
            signature,
          );
          // FR-003 AC1 / FR-036 — confirm on the device
          setPhase({ kind: 'paired', purpose: payload.purpose });
        } catch (err) {
          // 400 invalid, 401 bad signature, 409 already used, 410 expired — the server says which.
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof SigningError
                ? 'Signing was cancelled or failed. Try again.'
                : 'Could not reach NexusID. Check your connection.';
          setPhase({ kind: 'error', message });
        }
      } catch (err) {
        setPhase({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Could not pair this browser.',
        });
      }
    },
    [userId],
  );

  const objectOutput = useObjectOutput({
    types: ['qr'],
    onObjectsScanned: (objects: ScannedObject[]) => {
      const code = objects.find(
        o => typeof (o as ScannedCode).value === 'string',
      ) as ScannedCode | undefined;
      if (code?.value) void handle(code.value);
    },
  });

  const retry = () => {
    busy.current = false;
    setPhase({ kind: 'scanning' });
  };

  if (!hasPermission) {
    return (
      <Screen onBack={navigation.goBack} title="Scan QR">
        <View style={s.center}>
          <IconTile Icon={CameraIcon} />
          <Text variant="sectionTitle" align="center">
            Camera access needed
          </Text>
          <Text variant="bodySmall" align="center" style={{ maxWidth: 280 }}>
            NexusID uses the camera only to read the pairing code shown in your
            browser.
          </Text>
          <Button
            label={canRequestPermission ? 'Allow camera' : 'Open settings'}
            onPress={() =>
              canRequestPermission
                ? requestPermission()
                : Linking.openSettings()
            }
            style={{ alignSelf: 'stretch', marginTop: space[3] }}
          />
        </View>
      </Screen>
    );
  }

  if (phase.kind === 'paired') {
    return (
      <Screen style={s.center}>
        <AnimatedCheck size={112} />
        <Text variant="pageTitle" align="center">
          {phase.purpose === 'SIGN_IN' ? 'Signed in' : 'Browser paired'}
        </Text>
        <Text variant="bodySmall" align="center" style={{ maxWidth: 300 }}>
          {phase.purpose === 'SIGN_IN'
            ? 'Your computer opens the NexusID dashboard now. No password was needed.'
            : 'Verification requests from that browser now come to this phone. Only the answer is shared. Never your data.'}
        </Text>
        <Button
          label="Done"
          Icon={Link2}
          onPress={navigation.goBack}
          style={{ alignSelf: 'stretch', marginTop: space[4] }}
        />
      </Screen>
    );
  }

  return (
    <View style={s.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device="back"
        isActive={phase.kind === 'scanning'}
        outputs={[objectOutput]}
        resizeMode="cover"
      />
      <Overlay phase={phase} onClose={navigation.goBack} onRetry={retry} />
    </View>
  );
}

function Overlay({
  phase,
  onClose,
  onRetry,
}: {
  phase: Phase;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = Math.min(width * 0.7, 280);
  const top = (height - box) / 2 - 40;
  const left = (width - box) / 2;
  const scrim = 'rgba(5,6,9,0.68)';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Scrim around the cutout */}
      <View
        style={[
          s.scrim,
          { backgroundColor: scrim, top: 0, height: top, left: 0, right: 0 },
        ]}
      />
      <View
        style={[
          s.scrim,
          {
            backgroundColor: scrim,
            top: top + box,
            bottom: 0,
            left: 0,
            right: 0,
          },
        ]}
      />
      <View
        style={[
          s.scrim,
          { backgroundColor: scrim, top, height: box, left: 0, width: left },
        ]}
      />
      <View
        style={[
          s.scrim,
          { backgroundColor: scrim, top, height: box, right: 0, width: left },
        ]}
      />
      <Corners
        top={top}
        left={left}
        size={box}
        active={phase.kind === 'scanning'}
        color={phase.kind === 'error' ? colors.danger : colors.white}
      />

      <View style={[s.topBar, { top: insets.top + space[2] }]}>
        <IconButton
          Icon={X}
          label="Close scanner"
          onPress={onClose}
          color={colors.white}
        />
      </View>

      <View style={[s.caption, { top: top + box + space[6] }]}>
        {phase.kind === 'scanning' ? (
          <>
            <Text variant="sectionTitle" align="center" color={colors.white}>
              Scan the code in your browser
            </Text>
            <Text variant="bodySmall" align="center" color="#C9CEDB">
              Point the camera at the code in the NexusID extension or on the
              sign-in page.
            </Text>
          </>
        ) : phase.kind === 'claiming' ? (
          <Animated.View
            entering={FadeIn}
            style={{ alignItems: 'center', gap: space[2] }}
            accessibilityLiveRegion="polite"
          >
            <Spinner color={colors.accentText} size={24} />
            <Text variant="label" color={colors.white}>
              {phase.purpose === 'SIGN_IN'
                ? 'Signing you in…'
                : 'Pairing with your browser…'}
            </Text>
          </Animated.View>
        ) : phase.kind === 'error' ? (
          <Animated.View
            entering={FadeIn}
            style={s.errorCard}
            accessibilityLiveRegion="polite"
          >
            <View
              style={{
                flexDirection: 'row',
                gap: space[2],
                alignItems: 'center',
              }}
            >
              <CircleX size={20} color={colors.danger} strokeWidth={2} />
              <Text variant="label" color={colors.danger}>
                Couldn't pair
              </Text>
            </View>
            <Text variant="bodySmall">{phase.message}</Text>
            <Button label="Retry" size="md" onPress={onRetry} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function Corners({
  top,
  left,
  size,
  active,
  color,
}: {
  top: number;
  left: number;
  size: number;
  active: boolean;
  color: string;
}) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (active && !reduced)
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0, { duration: 900 }),
        ),
        -1,
      );
    else pulse.value = withTiming(0, { duration: 150 });
  }, [active, reduced, pulse]);
  const st = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.03 }],
  }));
  const L = 36;
  const W = 4;
  const r = 20;
  const corner = (pos: object, edges: object) => (
    <View
      style={[
        { position: 'absolute', width: L, height: L, borderColor: color },
        pos,
        edges,
      ]}
    />
  );
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top, left, width: size, height: size },
        st,
      ]}
    >
      {corner(
        { top: -2, left: -2 },
        { borderTopWidth: W, borderLeftWidth: W, borderTopLeftRadius: r },
      )}
      {corner(
        { top: -2, right: -2 },
        { borderTopWidth: W, borderRightWidth: W, borderTopRightRadius: r },
      )}
      {corner(
        { bottom: -2, left: -2 },
        { borderBottomWidth: W, borderLeftWidth: W, borderBottomLeftRadius: r },
      )}
      {corner(
        { bottom: -2, right: -2 },
        {
          borderBottomWidth: W,
          borderRightWidth: W,
          borderBottomRightRadius: r,
        },
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    padding: space.page,
  },
  scrim: { position: 'absolute' },
  topBar: { position: 'absolute', left: space[3] },
  caption: {
    position: 'absolute',
    left: space.page,
    right: space.page,
    alignItems: 'center',
    gap: space[2],
  },
  errorCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: space[4],
    gap: space[3],
  },
});
