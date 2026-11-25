import React from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../styles/tokens';
import { Text } from './Text';

/** Logo mark: rounded square, accent fill, white "N" in DM Sans 700 (§10). */
export function Logo({ size = 56 }: { size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="NexusID"
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: fonts.displayBold, fontSize: size * 0.56, lineHeight: size * 0.7, color: colors.white }}>N</Text>
    </View>
  );
}
