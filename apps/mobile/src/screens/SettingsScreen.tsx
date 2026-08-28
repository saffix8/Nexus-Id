// apps/mobile/src/screens/SettingsScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { colors, spacing, typography } from '../styles/tokens';

export function SettingsScreen() {
  const { logout, userId } = useAuthStore();

  const rows = [
    { label: 'Account', value: userId ?? '—' },
    { label: 'Biometric approval', value: 'Enabled' },
    { label: 'Push notifications', value: 'Enabled' },
    { label: 'App version', value: '1.0.0' },
  ];

  return (
    <ScrollView style={s.container}>
      <Text style={s.heading}>Settings</Text>
      {rows.map(r => (
        <View key={r.label} style={s.row}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.value}>{r.value}</Text>
        </View>
      ))}
      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, padding: spacing[4] },
  heading: { fontSize: typography.xl, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing[4] },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  label: { fontSize: typography.base, color: colors.textSecondary },
  value: { fontSize: typography.base, color: colors.textPrimary },
  logoutBtn: { marginTop: spacing[6], borderWidth: 1, borderColor: '#4A1515', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: colors.danger, fontWeight: '600', fontSize: typography.base },
});
