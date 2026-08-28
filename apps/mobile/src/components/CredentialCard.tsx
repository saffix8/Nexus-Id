// apps/mobile/src/components/CredentialCard.tsx
// React Native equivalent of apps/web/components/CredentialCard.tsx,
// used inside CredentialListScreen (P2).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../styles/tokens';
import type { SDJWTCredential } from '@nexusid/types';

const CREDENTIAL_META = {
  identity:   { label: 'National Identity', icon: '🆔', accent: colors.credIdentity },
  education:  { label: 'Education',         icon: '🎓', accent: colors.credEducation },
  employment: { label: 'Employment',        icon: '💼', accent: colors.credEmployment },
  enrollment: { label: 'Enrollment',        icon: '🏫', accent: colors.credEnrollment },
} as const;

function getStatus(expiresAt: string): 'Active' | 'Expiring Soon' | 'Expired' {
  const exp = new Date(expiresAt).getTime();
  const now = Date.now();
  if (exp < now) return 'Expired';
  if (exp - now < 30 * 24 * 60 * 60 * 1000) return 'Expiring Soon';
  return 'Active';
}

interface CredentialCardProps {
  credential: SDJWTCredential;
  onPress: () => void;
  onLongPress?: () => void;
}

export function CredentialCard({ credential, onPress, onLongPress }: CredentialCardProps) {
  const meta = CREDENTIAL_META[credential.type];
  const status = getStatus(credential.expires_at);
  const statusColor = status === 'Active' ? colors.success : status === 'Expiring Soon' ? colors.warning : colors.danger;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.8}>
      <View style={[s.header, { backgroundColor: `${meta.accent}15` }]}>
        <View style={s.headerLeft}>
          <View style={[s.iconBox, { backgroundColor: `${meta.accent}25` }]}>
            <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
          </View>
          <View>
            <Text style={[s.typeLabel, { color: meta.accent }]}>{meta.label}</Text>
            <Text style={s.issuer}>{credential.issuer}</Text>
          </View>
        </View>
        <View style={[s.statusDot, { backgroundColor: statusColor }]} />
      </View>
      <View style={s.body}>
        <Text style={s.status}>{status}</Text>
        <Text style={s.issuedAt}>Issued {new Date(credential.issued_at).toLocaleDateString()}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderSubtle, overflow: 'hidden', marginBottom: spacing[3] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing[4] },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  iconBox: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: typography.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  issuer: { fontSize: typography.sm, color: colors.textPrimary, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  body: { paddingHorizontal: spacing[4], paddingBottom: spacing[3], flexDirection: 'row', justifyContent: 'space-between' },
  status: { fontSize: typography.sm, color: colors.textSecondary },
  issuedAt: { fontSize: typography.xs, color: colors.textTertiary },
});
