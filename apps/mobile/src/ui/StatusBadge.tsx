import React from 'react';
import { StyleSheet, View } from 'react-native';
import { STATUS, type StatusKind } from '../lib/status';
import { alpha, fonts, space } from '../styles/tokens';
import { Text } from './Text';
import { PulseDot } from './PulseDot';

/** Status pill: icon + label + colour, never colour alone (§3.2, §9). */
export function StatusBadge({ status, compact }: { status: StatusKind; compact?: boolean }) {
  const { label, color, Icon } = STATUS[status];
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${label.toLowerCase()}`}
      style={[s.pill, { backgroundColor: alpha(color, 0.1), borderColor: alpha(color, 0.25) }]}
    >
      {status === 'pending' ? <PulseDot color={color} /> : <Icon size={compact ? 12 : 14} color={color} strokeWidth={2} />}
      <Text variant="eyebrow" color={color} style={{ fontFamily: fonts.bodySemiBold, fontSize: compact ? 10 : 11 }}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[2],
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
