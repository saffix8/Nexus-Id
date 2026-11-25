// Bottom tabs with labels (Wallet · History · Profile) and a centred floating
// Scan button — DESIGN.md §6.2. Tab bar = surface, top border = border.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { History, ScanLine, UserRound, WalletCards, type LucideIcon } from 'lucide-react-native';
import { colors, fonts, icon, space } from '../styles/tokens';
import { Text } from '../ui';

const TABS: Record<string, { label: string; Icon: LucideIcon }> = {
  Wallet: { label: 'Wallet', Icon: WalletCards },
  History: { label: 'History', Icon: History },
  Profile: { label: 'Profile', Icon: UserRound },
};

/** Tab bar row height without the bottom inset. */
export const TAB_BAR_HEIGHT = 64;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, space[2]);
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const height = useTabBarHeight();
  return (
    <View style={[s.bar, { height }]}>
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={s.tab}
          >
            <View style={[s.pill, focused && { backgroundColor: colors.overlay }]}>
              <meta.Icon size={icon.nav} color={focused ? colors.accentText : colors.textMuted} strokeWidth={icon.stroke} />
            </View>
            <Text
              variant="bodySmall"
              style={{ fontSize: 12, lineHeight: 16, fontFamily: focused ? fonts.bodySemiBold : fonts.body }}
              color={focused ? colors.text : colors.textMuted}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Centred floating Scan button (56 px, accent fill), rendered above the tab bar. */
export function ScanFab() {
  const navigation = useNavigation();
  const bottom = useTabBarHeight() + space[4];
  return (
    <View pointerEvents="box-none" style={[s.fabRow, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan QR code"
        onPress={() => navigation.navigate('Scan')}
        style={({ pressed }) => [s.fab, pressed && { backgroundColor: colors.accentHover, transform: [{ scale: 0.97 }] }]}
      >
        <ScanLine size={26} color={colors.white} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[2] },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  fabRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
  },
});
