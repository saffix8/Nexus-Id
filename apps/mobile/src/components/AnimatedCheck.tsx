// Success check — SVG stroke draw 450 ms, then scale 1 → 1.05 → 1 (DESIGN §3.5).
import React, { useEffect } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { alpha, colors, motion } from '../styles/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CHECK_LEN = 48; // approx length of the check path below
const RING_R = 44;
const RING_LEN = 2 * Math.PI * RING_R;

export function AnimatedCheck({ size = 120, color = colors.success }: { size?: number; color?: string }) {
  const reduced = useReducedMotion();
  const ring = useSharedValue(reduced ? 1 : 0);
  const draw = useSharedValue(reduced ? 1 : 0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(reduced ? 0 : 1);

  useEffect(() => {
    if (reduced) {
      opacity.value = withTiming(1, { duration: 200 });
      return;
    }
    ring.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
    draw.value = withDelay(200, withTiming(1, { duration: motion.checkDraw, easing: Easing.out(Easing.cubic) }));
    scale.value = withDelay(200 + motion.checkDraw, withSequence(withTiming(1.05, { duration: 120 }), withTiming(1, { duration: 160 })));
  }, [reduced, ring, draw, scale, opacity]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LEN * (1 - ring.value) }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.value) }));
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  return (
    <Animated.View style={[{ width: size, height: size }, wrap]} accessible accessibilityLabel="Verified">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={RING_R} fill={alpha(color, 0.1)} />
        <AnimatedCircle
          cx={50}
          cy={50}
          r={RING_R}
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${RING_LEN} ${RING_LEN}`}
          animatedProps={ringProps}
          transform="rotate(-90 50 50)"
        />
        <AnimatedPath
          d="M31 51 L44 64 L70 37"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`}
          animatedProps={checkProps}
        />
      </Svg>
    </Animated.View>
  );
}
