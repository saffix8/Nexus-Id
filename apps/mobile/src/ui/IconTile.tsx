import React from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { alpha, colors, icon } from '../styles/tokens';

/** 64 px rounded square with a 40 px icon (empty states, §3.6). */
export function IconTile({ Icon, color = colors.textMuted, size = 64 }: { Icon: LucideIcon; color?: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: alpha(color, 0.12),
        borderWidth: 1,
        borderColor: alpha(color, 0.25),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.55)} color={color} strokeWidth={icon.stroke} />
    </View>
  );
}
