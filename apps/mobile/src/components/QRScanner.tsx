// apps/mobile/src/components/QRScanner.tsx
// Camera QR scanner. Returns the raw decoded string; callers parse it
// (e.g. PairBrowserScreen parses the extension's pairing payload).
// Requires: react-native-vision-camera (useCodeScanner) — not installed yet,
// so this renders a placeholder and never calls onScan.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../styles/tokens';

interface QRScannerProps {
  hint?: string;
  onScan: (raw: string) => void;
  onCancel: () => void;
}

export function QRScanner({ hint, onScan: _onScan, onCancel }: QRScannerProps) {
  // Once react-native-vision-camera is installed:
  //   const codeScanner = useCodeScanner({
  //     codeTypes: ['qr'],
  //     onCodeScanned: codes => { const v = codes[0]?.value; if (v) _onScan(v); },
  //   });
  //   <Camera style={StyleSheet.absoluteFill} device={device} isActive codeScanner={codeScanner} />
  return (
    <View style={s.container}>
      <Text style={s.hint}>{hint ?? 'Point your camera at the NexusID QR code'}</Text>
      <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
        <Text style={s.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  hint: { color: colors.textSecondary, fontSize: typography.base, textAlign: 'center' },
  cancelBtn: { marginTop: spacing[6], paddingVertical: spacing[3], paddingHorizontal: spacing[6] },
  cancelText: { color: colors.textTertiary, fontSize: typography.base },
});
