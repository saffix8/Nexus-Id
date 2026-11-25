// SCR-006 Profile (simplified for the demo): account, device key, paired browsers, sign out.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Fingerprint, KeyRound, Lock, LogOut, ScanLine, UserRound } from 'lucide-react-native';
import { API_BASE_URL } from '../config';
import { truncateId } from '../lib/format';
import { PRIVACY_LINE } from '../lib/copy';
import type { RootStackParamList } from '../navigation/types';
import { useTabBarHeight } from '../navigation/TabBar';
import { useAuthStore } from '../store/auth.store';
import { useSessionStore } from '../store/session.store';
import { colors, icon, space } from '../styles/tokens';
import { Button, Card, ConfirmDialog, Screen, StatusBadge, Text } from '../ui';

export function ProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { email, userId, publicKey, logout } = useAuthStore();
  const [confirm, setConfirm] = useState(false);
  const bottomPad = useTabBarHeight() + 56 + space[8];

  return (
    <Screen eyebrow="Profile" title="Account" noBottomInset>
      <ScrollView contentContainerStyle={{ padding: space.page, paddingBottom: bottomPad, gap: space[5] }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <View style={s.avatar}>
            <UserRound size={icon.header} color={colors.accentText} strokeWidth={icon.stroke} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={1}>
              {email ?? 'Signed in'}
            </Text>
            {userId ? <Text variant="mono">{truncateId(userId, 8, 4)}</Text> : null}
          </View>
        </Card>

        <View>
          <Text variant="eyebrow" style={{ marginBottom: space[3] }}>
            Security
          </Text>
          <Card style={{ padding: 0 }}>
            <Item Icon={KeyRound} title="Device key" body="RSA-2048 in the Android Keystore. It never leaves this phone." right={<StatusBadge status={publicKey ? 'valid' : 'not-paired'} compact />} />
            <Item Icon={Fingerprint} title="Biometric lock" body="Needed to open the wallet and to approve every request." border />
            <Item Icon={Lock} title="Privacy" body={PRIVACY_LINE} border />
          </Card>
        </View>

        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow">Browsers</Text>
          <Button label="Pair a browser" Icon={ScanLine} variant="secondary" onPress={() => nav.navigate('Scan')} />
          <Button label="Lock now" Icon={Lock} variant="secondary" onPress={() => useSessionStore.getState().setUnlocked(false)} />
          <Button label="Sign out" Icon={LogOut} variant="danger" onPress={() => setConfirm(true)} />
        </View>

        <Text variant="mono" align="center" style={{ color: colors.textFaint }}>
          {API_BASE_URL}
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

function Item({ Icon, title, body, right, border }: { Icon: typeof KeyRound; title: string; body: string; right?: React.ReactNode; border?: boolean }) {
  return (
    <View style={[s.item, border && { borderTopWidth: 1, borderTopColor: colors.borderSubtle }]}>
      <Icon size={icon.nav} color={colors.textMuted} strokeWidth={icon.stroke} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{title}</Text>
        <Text variant="bodySmall">{body}</Text>
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], padding: space[4] },
});
