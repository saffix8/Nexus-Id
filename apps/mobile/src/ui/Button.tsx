import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { alpha, colors, fonts, icon, motion, radius, space } from '../styles/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  Icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  /** Spoken label when it differs from the visible one. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
}

const palette: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.accent, fg: colors.white, border: colors.accent, pressed: colors.accentHover },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border, pressed: colors.overlay },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent', pressed: colors.overlay },
  danger: { bg: alpha(colors.danger, 0.1), fg: colors.danger, border: alpha(colors.danger, 0.25), pressed: alpha(colors.danger, 0.18) },
};

/**
 * Button — 8 px radius, scale 0.98 on press (§3.5), ≥ 48 px touch target.
 * The scale lives on an Animated.View wrapper; the Pressable keeps a plain style
 * function (Reanimated 4 drops function styles on animated components, which left
 * buttons without their fill).
 */
export function Button({ label, onPress, variant = 'primary', Icon, loading, disabled, accessibilityLabel, style, size = 'lg' }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const p = palette[variant];
  const inactive = disabled || loading;
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  // Layout props go on the outer wrapper so flex / alignSelf / margins from callers still work.
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, width, minWidth, maxWidth, ...inner } = flat;
  const outer: ViewStyle = { flex, flexGrow, flexShrink, flexBasis, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, width, minWidth, maxWidth };

  return (
    <Animated.View style={[outer, animated]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={() => (scale.value = withTiming(0.98, { duration: motion.press }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: motion.press }))}
        style={({ pressed }) => [
          s.base,
          size === 'lg' ? s.lg : s.md,
          { backgroundColor: pressed ? p.pressed : p.bg, borderColor: p.border, opacity: disabled ? 0.45 : 1 },
          inner,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          <View style={s.row}>
            {Icon ? <Icon size={icon.nav} color={p.fg} strokeWidth={icon.stroke} /> : null}
            <Text variant="label" color={p.fg} numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.bodySemiBold, flexShrink: 1 }}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  base: { borderRadius: radius.button, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4] },
  lg: { minHeight: 52 },
  md: { minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], maxWidth: '100%' },
});
