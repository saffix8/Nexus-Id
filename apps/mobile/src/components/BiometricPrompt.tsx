// apps/mobile/src/components/BiometricPrompt.tsx
// Thin UI wrapper around KeystoreService.signData's biometric flow (P2 Android Keystore).
// Use this to show a consistent full-screen prompt while
// react-native-biometrics is waiting on Face/Touch ID.
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../styles/tokens';

interface BiometricPromptProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
}

export function BiometricPrompt({ visible, title = 'Approve Verification', subtitle }: BiometricPromptProps) {
  if (!visible) return null;
  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <Text style={s.title}>{title}</Text>
        {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,14,19,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  card: { backgroundColor: colors.bgElevated, borderRadius: 16, padding: spacing[6], alignItems: 'center', gap: spacing[3], borderWidth: 1, borderColor: colors.borderSubtle },
  title: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '600' },
  subtitle: { color: colors.textSecondary, fontSize: typography.sm, textAlign: 'center' },
});
