// SCR-006 Profile (simplified for the demo): account, device key, paired browsers, sign out.
// Grouped settings list — one row per action, not a stack of big buttons.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Fingerprint, KeyRound, Lock, LogOut, ScanLine, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { API_BASE_URL } from '../config';
import { truncateId } from '../lib/format';
import { PRIVACY_LINE } from '../lib/copy';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/auth.store';
import { useSessionStore } from '../store/session.store';
import { alpha, colors, fonts, icon, radius, space } from '../styles/tokens';
import { Card, ConfirmDialog, Screen, StatusBadge, Text } from '../ui';

function initials(email: string | null | undefined) {
  const name = (email ?? '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'N') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function ProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { email, userId, publicKey, logout } = useAuthStore();
  const [confirm, setConfirm] = useState(false);

  return (
    <Screen eyebrow="Profile" title="Account" noBottomInset>
      <ScrollView contentContainerStyle={{ padding: space.page, paddingBottom: space[8], gap: space[6] }}>
        <View style={s.identity}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials(email)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="label" numberOfLines={1} style={{ fontSize: 16, lineHeight: 22 }}>
              {email ?? 'Signed in'}
            </Text>
            {userId ? <Text variant="mono" numberOfLines={1}>{truncateId(userId, 8, 4)}</Text> : null}
          </View>
        </View>

        <Group title="Security">
          <Row Icon={KeyRound} title="Device key" body="RSA-2048 in the Android Keystore. Never leaves this phone." badge={<StatusBadge status={publicKey ? 'valid' : 'not-paired'} compact />} />
          <Row Icon={Fingerprint} title="Biometric lock" body="Opens the wallet and approves every request." />
          <Row Icon={ShieldCheck} title="Privacy" body={PRIVACY_LINE} />
        </Group>

        <Group title="Browsers & session">
          <Row Icon={ScanLine} title="Pair a browser" body="Scan or paste the code from the extension." onPress={() => nav.navigate('Scan')} />
          <Row Icon={Lock} title="Lock now" body="Ask for your fingerprint again." onPress={() => useSessionStore.getState().setUnlocked(false)} />
        </Group>

        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirm(true)}
          style={({ pressed }) => [s.signOut, pressed && { backgroundColor: alpha(colors.danger, 0.14) }]}
        >
          <LogOut size={icon.nav} color={colors.danger} strokeWidth={icon.stroke} />
          <Text variant="label" color={colors.danger} style={{ fontFamily: fonts.bodySemiBold }}>
            Sign out
          </Text>
        </Pressable>

        <Text variant="mono" align="center" numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11 }}>
          NexusID 1.0 · {API_BASE_URL.replace(/^https?:\/\//, '')}
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirm}
        title="Sign out of NexusID?"
        body="This phone's device key is removed. You'll set up the device again when you sign back in."
        confirmLabel="Sign out"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void logout();
        }}
      />
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="eyebrow" style={{ paddingHorizontal: space[1] }} accessibilityRole="header">
        {title}
      </Text>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {items.map((child, i) => (
          <View key={i} style={i > 0 ? s.divider : undefined}>
            {child}
          </View>
        ))}
      </Card>
    </View>
  );
}

function Row({ Icon, title, body, badge, onPress }: { Icon: LucideIcon; title: string; body: string; badge?: React.ReactNode; onPress?: () => void }) {
  const content = (
    <>
      <View style={s.rowIcon}>
        <Icon size={18} color={colors.textMuted} strokeWidth={icon.stroke} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <Text variant="label">{title}</Text>
          {badge}
        </View>
        <Text variant="bodySmall" style={{ fontSize: 13, lineHeight: 18 }}>
          {body}
        </Text>
      </View>
      {onPress ? <ChevronRight size={18} color={colors.textFaint} strokeWidth={icon.stroke} /> : null}
    </>
  );
  if (!onPress) return <View style={s.row}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.overlay }]}>
      {content}
    </Pressable>
  );
}

const s = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[1] },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: alpha(colors.accent, 0.14),
    borderWidth: 1,
    borderColor: alpha(colors.accent, 0.35),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.display, fontSize: 18, color: colors.accentText },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] + 2, minHeight: 60 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    minHeight: 52,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: alpha(colors.danger, 0.25),
    backgroundColor: alpha(colors.danger, 0.08),
  },
});
