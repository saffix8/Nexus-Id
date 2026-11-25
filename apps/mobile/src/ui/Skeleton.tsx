import React, { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radius } from '../styles/tokens';

/** Loading placeholder in the shape of the content (§7). */
export function Skeleton({ width = '100%', height, r = radius.card, style }: { width?: DimensionValue; height: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0.5);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [o, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityElementsHidden style={[{ width, height, borderRadius: r, backgroundColor: colors.overlay }, st, style]} />;
}
