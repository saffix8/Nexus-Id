import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming, cancelAnimation } from 'react-native-reanimated';
import { colors, fonts, timing } from '../styles/tokens';
import { formatCountdown } from '../lib/format';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** Seconds left (integer, updated each second by the parent). */
  remaining: number;
  total?: number;
  size?: number;
}

/** Countdown ring — linear, continuous; warning < 30 s, danger < 10 s (§3.5). */
export function CountdownRing({ remaining, total = timing.requestTtlSec, size = 56 }: Props) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(Math.max(0, remaining) / total);

  useEffect(() => {
    // Animate to where the ring will be in one second — keeps it moving smoothly between ticks.
    const next = Math.max(0, remaining - 1) / total;
    progress.value = Math.max(0, remaining) / total;
    if (remaining > 0) progress.value = withTiming(next, { duration: 1000, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [remaining, total, progress]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }));
  const color = remaining <= timing.dangerAtSec ? colors.danger : remaining <= timing.warnAtSec ? colors.warning : colors.accentText;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${Math.max(0, remaining)} seconds left`}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={animatedProps}
        />
      </Svg>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color, fontVariant: ['tabular-nums'] }}>{formatCountdown(remaining)}</Text>
    </View>
  );
}
