// apps/mobile/src/screens/PairBrowserScreen.tsx
// SRS FR-003 (SCR-007): scan the QR shown by the NexusID Chrome extension to
// pair that browser with this device's account. The challenge is signed with
// the Keystore device key (CryptoService) and redeemed via API-025, where the
// backend runs ALG-006 + ALG-007. Requests from that browser are then routed
// to this phone only.
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { QRScanner } from '../components/QRScanner';
import { apiService, ApiError } from '../services/api.service';
import cryptoService, { SigningError } from '../services/crypto.service';
import { useAuthStore } from '../store/auth.store';
import { colors, spacing, typography } from '../styles/tokens';

interface PairingPayload {
  challengeId: string;
  code: string;
}

type Phase =
  | { kind: 'scanning' }
  | { kind: 'claiming' }
  | { kind: 'paired' }
  | { kind: 'error'; message: string };

/**
 * Parses the extension's QR. Current form is a web-portal link
 * `<origin>/pair#p=<challengeId>&c=<code>`; the older raw JSON
 * {"v":1,"type":"nexusid-pair","pairingId","code"} is still accepted.
 * Parsed by hand: React Native's URL polyfill lacks full URLSearchParams.
 */
function parsePairingLink(raw: string): PairingPayload | null {
  const hashAt = raw.indexOf('#');
  if (hashAt < 0) return null;
  const path = raw.slice(0, hashAt).replace(/\/+$/, '');
  if (!path.endsWith('/pair')) return null;

  const fields: Record<string, string> = {};
  for (const part of raw.slice(hashAt + 1).split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    try {
      fields[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(
        part.slice(eq + 1),
      );
    } catch {
      return null;
    }
  }
  const challengeId = fields.p;
  const code = fields.c;
  return challengeId && code ? { challengeId, code } : null;
}

function parsePairingPayload(raw: string): PairingPayload | null {
  const text = raw.trim();
  if (!text.startsWith('{')) return parsePairingLink(text);
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    if (v.v !== 1 || v.type !== 'nexusid-pair') return null;
    if (typeof v.pairingId !== 'string' || typeof v.code !== 'string')
      return null;
    return { challengeId: v.pairingId, code: v.code };
  } catch {
    return null;
  }
}

interface PairBrowserScreenProps {
  onDone: () => void;
}

export function PairBrowserScreen({ onDone }: PairBrowserScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const userId = useAuthStore((state) => state.userId);

  async function handleScan(raw: string) {
    if (phase.kind !== 'scanning') return; // ignore repeat frames

    const payload = parsePairingPayload(raw);
    if (!payload) {
      // UC-002 3.E1 — not a NexusID pairing code
      setPhase({
        kind: 'error',
        message: 'That QR code is not a NexusID pairing code.',
      });
      return;
    }

    setPhase({ kind: 'claiming' });
    try {
      if (!userId) {
        setPhase({ kind: 'error', message: 'Sign in to NexusID before pairing a browser.' });
        return;
      }
      // ALG-007 — prove this registered device redeemed the code (biometric prompt).
      const signature = await cryptoService.signQrChallenge(
        userId,
        payload.challengeId,
        payload.code,
      );
      await apiService.redeemQrChallenge(payload.challengeId, payload.code, signature);
      setPhase({ kind: 'paired' }); // FR-003 AC1 — confirm on the device
    } catch (err) {
      // 400 invalid, 401 bad signature, 409 already used, 410 expired — the
      // server message explains which. Signing errors cover a cancelled prompt.
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof SigningError
            ? 'Signing was cancelled or failed. Try again.'
            : 'Could not reach NexusID. Check your connection.';
      setPhase({ kind: 'error', message });
    }
  }

  if (phase.kind === 'scanning') {
    return (
      <QRScanner
        hint="Scan the QR code shown in the NexusID browser extension"
        onScan={handleScan}
        onCancel={onDone}
      />
    );
  }

  return (
    <View style={s.container}>
      {phase.kind === 'claiming' && (
        <>
          <ActivityIndicator color={colors.accentPrimary} />
          <Text style={s.body}>Pairing…</Text>
        </>
      )}

      {phase.kind === 'paired' && (
        <>
          <Text style={[s.title, { color: colors.success }]}>
            Browser paired
          </Text>
          <Text style={s.body}>
            Verification requests from that browser will now come to this phone.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={onDone}>
            <Text style={s.primaryText}>Done</Text>
          </TouchableOpacity>
        </>
      )}

      {phase.kind === 'error' && (
        <>
          <Text style={[s.title, { color: colors.danger }]}>Couldn’t pair</Text>
          <Text style={s.body}>{phase.message}</Text>
          <Text style={s.hint}>
            Generate a new code in the extension and scan again.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => setPhase({ kind: 'scanning' })}
          >
            <Text style={s.primaryText}>Scan again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.linkBtn} onPress={onDone}>
            <Text style={s.linkText}>Cancel</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  title: {
    fontSize: typography.lg,
    fontWeight: '600',
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  body: {
    fontSize: typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  hint: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing[3],
  },
  primaryBtn: {
    marginTop: spacing[6],
    borderRadius: 10,
    height: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimary,
  },
  primaryText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: typography.base,
  },
  linkBtn: { marginTop: spacing[3], padding: spacing[2] },
  linkText: { color: colors.textTertiary, fontSize: typography.base },
});
