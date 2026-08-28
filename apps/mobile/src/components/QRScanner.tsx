// apps/mobile/src/components/QRScanner.tsx
// Scans a NexusID offline verification QR (produced by apps/web QRGenerator.tsx)
// and decodes its payload for the verifier-side flow.
// Requires: react-native-camera or react-native-vision-camera + a barcode scanner lib.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../styles/tokens';

interface QRScannerProps {
  onScan: (payload: { v: number; iss: string; sd_jwt: string; disclosures: string[]; iat: number; exp: number }) => void;
  onCancel: () => void;
}

export function QRScanner({ onScan, onCancel }: QRScannerProps) {
  // Wire up your chosen camera/barcode library's onRead callback to:
  //   const decoded = JSON.parse(atob(base64urlToBase64(rawValue)));
  //   if (Date.now() > decoded.exp) { /* show expired */ return; }
  //   onScan(decoded);
  return (
    <View style={s.container}>
      <Text style={s.hint}>Point your camera at the NexusID QR code</Text>
      {/* <Camera onBarCodeRead={...} /> goes here once a camera lib is installed */}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  hint: { color: colors.textSecondary, fontSize: typography.base, textAlign: 'center' },
});
