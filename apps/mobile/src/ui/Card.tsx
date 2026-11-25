import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../styles/tokens';

/** Surface card: border, no shadow (§3.4). */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space[5] }, style]}>
      {children}
    </View>
  );
}
