import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, radius, sheetShadow, space } from '../styles/tokens';
import { Text } from './Text';

interface ToastState {
  message: string | null;
  tone: 'default' | 'error';
  show: (message: string, tone?: 'default' | 'error') => void;
  hide: () => void;
}

/** Small-action feedback ("Credential deleted"), §7. */
export const useToast = create<ToastState>(set => ({
  message: null,
  tone: 'default',
  show: (message, tone = 'default') => set({ message, tone }),
  hide: () => set({ message: null }),
}));

export const toast = (message: string, tone?: 'default' | 'error') => useToast.getState().show(message, tone);

export function ToastHost() {
  const { message, tone, hide } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 2600);
    return () => clearTimeout(t);
  }, [message, hide]);
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      pointerEvents="none"
      style={[s.toast, { bottom: insets.bottom + 96, borderColor: tone === 'error' ? colors.danger : colors.border }]}
      accessibilityLiveRegion="polite"
    >
      <Text variant="label" color={tone === 'error' ? colors.danger : colors.text}>
        {message}
      </Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.page,
    right: space.page,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...sheetShadow,
  },
});
