import React from 'react';
import { View } from 'react-native';
import { colors, space } from '../styles/tokens';

export function Divider({ inset = 0, spacing = space[4] }: { inset?: number; spacing?: number }) {
  return <View style={{ height: 1, backgroundColor: colors.borderSubtle, marginVertical: spacing, marginHorizontal: inset }} />;
}
