import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, icon, radius } from '../styles/tokens';

interface Props {
  Icon: LucideIcon;
  /** Required: every icon button has a spoken label (§9). */
  label: string;
  onPress: () => void;
  color?: string;
}

export function IconButton({ Icon, label, onPress, color = colors.text }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [s.btn, pressed && { backgroundColor: colors.overlay }]}
    >
      <Icon size={icon.header} color={color} strokeWidth={icon.stroke} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
});
