// apps/mobile/src/screens/HomeScreen.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCredentialsStore } from '../store/credentials.store';
import { useVerificationStore } from '../store/verification.store';
import { colors, spacing, typography } from '../styles/tokens';

// Landing tab shown on app open. Summarizes wallet state and routes into
// the same screens built in P2 (CredentialListScreen, HistoryScreen).
export function HomeScreen({ navigation }) {
  const { credentials } = useCredentialsStore();
  const { history } = useVerificationStore();

  return (
    <View style={s.container}>
      <Text style={s.greeting}>My NexusID</Text>

      <View style={s.statRow}>
        <View style={s.statCard}>
          <Text style={s.statValue}>{credentials.length}</Text>
          <Text style={s.statLabel}>Credentials</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statValue}>{history.length}</Text>
          <Text style={s.statLabel}>Verifications</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, padding: spacing[4] },
  greeting: { fontSize: typography.xl, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing[4] },
  statRow: { flexDirection: 'row', gap: spacing[3] },
  statCard: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: 12, padding: spacing[4], borderWidth: 1, borderColor: colors.borderSubtle },
  statValue: { fontSize: typography['2xl'], color: colors.textPrimary, fontWeight: '700' },
  statLabel: { fontSize: typography.sm, color: colors.textTertiary, marginTop: 4 },
});
