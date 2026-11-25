// Bottom tabs (Wallet · Scan · History · Profile) — DESIGN.md §6.2.
// The Scan button is docked in the centre of the bar (raised slightly above it) instead of
// floating over the screen, so it can never cover content on short phones.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { History, ScanLine, UserRound, WalletCards, type LucideIcon } from 'lucide-react-native';
import { alpha, colors, fonts, icon, space } from '../styles/tokens';
import { Text } from '../ui';

const TABS: Record<string, { label: string; Icon: LucideIcon }> = {
  Wallet: { label: 'Wallet', Icon: WalletCards },
  History: { label: 'History', Icon: History },
  Profile: { label: 'Profile', Icon: UserRound },
};

/** Tab bar row height without the bottom inset. */
export const TAB_BAR_HEIGHT = 60;
const SCAN_SIZE = 56;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, space[2]);
}

function TabButton({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const meta = TABS[name];
  const tint = focused ? colors.text : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={meta.label}
      onPress={onPress}
      android_ripple={{ color: alpha(colors.text, 0.06), borderless: true, radius: 40 }}
      style={s.tab}
    >
      <meta.Icon size={20} color={focused ? colors.accentText : colors.textMuted} strokeWidth={focused ? 2 : icon.stroke} />
      <Text
        variant="bodySmall"
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
        style={{ fontSize: 11, lineHeight: 14, fontFamily: focused ? fonts.bodySemiBold : fonts.bodyMedium }}
        color={tint}
      >
        {meta.label}
      </Text>
    </Pressable>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const height = useTabBarHeight();
  const go = (index: number) => {
    const route = state.routes[index];
    const focused = state.index === index;
    const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
  };
  const routes = state.routes.map((r, i) => ({ r, i }));
  const left = routes.filter(({ r }) => r.name === 'Wallet');
  const right = routes.filter(({ r }) => r.name !== 'Wallet');

  return (
    <View style={[s.bar, { height }]}>
      {left.map(({ r, i }) => (
        <TabButton key={r.key} name={r.name} focused={state.index === i} onPress={() => go(i)} />
      ))}

      <View style={s.scanSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan QR code"
          onPress={() => navigation.navigate('Scan' as never)}
          style={({ pressed }) => [s.scan, pressed && { backgroundColor: colors.accentHover, transform: [{ scale: 0.96 }] }]}
        >
          <ScanLine size={18} color={colors.white} strokeWidth={2} />
        </Pressable>
        <Text variant="bodySmall" maxFontSizeMultiplier={1.15} style={s.scanLabel} color={colors.text}>
          Scan
        </Text>
      </View>

      {right.map(({ r, i }) => (
        <TabButton key={r.key} name={r.name} focused={state.index === i} onPress={() => go(i)} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.border,
    paddingTop: space[2],
    paddingHorizontal: space[2],
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 4, minHeight: 48, paddingTop: 5 },
  scanSlot: { flex: 1, alignItems: 'center', paddingTop: 0 },
  // Fully inside the bar: never overlaps screen content.
  scan: {
    width: SCAN_SIZE,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLabel: { fontSize: 11, lineHeight: 14, marginTop: 4, fontFamily: fonts.bodyMedium },
});
