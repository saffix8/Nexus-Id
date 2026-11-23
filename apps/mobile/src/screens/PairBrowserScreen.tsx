// apps/mobile/src/screens/PairBrowserScreen.tsx
// SRS UC-002 / FR-003: scan the QR shown by the NexusID Chrome extension to
// pair that browser with this device's account. Verification requests from
// the browser are then routed to this phone only.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { QRScanner } from '../components/QRScanner';
import { apiService, ApiError } from '../services/api.service';
import { colors, spacing, typography } from '../styles/tokens';

interface PairingPayload {
  pairingId: string;
  code: string;
}

type Phase =
  | { kind: 'scanning' }
  | { kind: 'claiming' }
  | { kind: 'paired' }
  | { kind: 'error'; message: string };

/** Parses the extension's QR: {"v":1,"type":"nexusid-pair","pairingId","code"}. */
function parsePairingPayload(raw: string): PairingPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    if (v.v !== 1 || v.type !== 'nexusid-pair') return null;
    if (typeof v.pairingId !== 'string' || typeof v.code !== 'string') return null;
    return { pairingId: v.pairingId, code: v.code };
  } catch {
    return null;
  }
}

interface PairBrowserScreenProps {
  onDone: () => void;
}

export function PairBrowserScreen({ onDone }: PairBrowserScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });

  async function handleScan(raw: string) {
    if (phase.kind !== 'scanning') return; // ignore repeat frames

    const payload = parsePairingPayload(raw);
    if (!payload) {
      // UC-002 3.E1 — not a NexusID pairing code
      setPhase({ kind: 'error', message: 'That QR code is not a NexusID pairing code.' });
      return;
    }

    setPhase({ kind: 'claiming' });
    try {
      await apiService.claimPairing(payload.pairingId, payload.code);
      setPhase({ kind: 'paired' }); // UC-002 step 5
    } catch (err) {
      // 400 invalid, 409 already used, 410 expired — server message explains which.
      const message =
        err instanceof ApiError ? err.message : 'Could not reach NexusID. Check your connection.';
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
          <Text style={[s.title, { color: colors.success }]}>Browser paired</Text>
          <Text style={s.body}>Verification requests from that browser will now come to this phone.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={onDone}>
            <Text style={s.primaryText}>Done</Text>
          </TouchableOpacity>
        </>
      )}

      {phase.kind === 'error' && (
        <>
          <Text style={[s.title, { color: colors.danger }]}>Couldn’t pair</Text>
          <Text style={s.body}>{phase.message}</Text>
          <Text style={s.hint}>Generate a new code in the extension and scan again.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => setPhase({ kind: 'scanning' })}>
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
  container: { flex: 1, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  title: { fontSize: typography.lg, fontWeight: '600', marginBottom: spacing[2], textAlign: 'center' },
  body: { fontSize: typography.base, color: colors.textSecondary, textAlign: 'center', marginTop: spacing[2] },
  hint: { fontSize: typography.sm, color: colors.textTertiary, textAlign: 'center', marginTop: spacing[3] },
  primaryBtn: { marginTop: spacing[6], borderRadius: 10, height: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentPrimary },
  primaryText: { color: colors.textPrimary, fontWeight: '600', fontSize: typography.base },
  linkBtn: { marginTop: spacing[3], padding: spacing[2] },
  linkText: { color: colors.textTertiary, fontSize: typography.base },
});
