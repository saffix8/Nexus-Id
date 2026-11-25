import React, { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LoaderCircle } from 'lucide-react-native';

/** LoaderCircle spinning on the UI thread; static under reduced motion. */
export function Spinner({ color, size = 20 }: { color: string; size?: number }) {
  const reduced = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (!reduced) r.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1);
  }, [r, reduced]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={st} accessibilityLabel="Loading">
      <LoaderCircle size={size} color={color} strokeWidth={2} />
    </Animated.View>
  );
}
