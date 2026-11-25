import React from 'react';
import { View } from 'react-native';
import { colors, space } from '../styles/tokens';

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: 1, backgroundColor: colors.borderSubtle, marginVertical: space[4], marginHorizontal: inset }} />;
}
