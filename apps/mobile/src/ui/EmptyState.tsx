import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { space } from '../styles/tokens';
import { Button } from './Button';
import { IconTile } from './IconTile';
import { Text } from './Text';

interface Props {
  Icon: LucideIcon;
  iconColor?: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}

/** Empty state: 64 px icon tile + title + one sentence + one action (§7). */
export function EmptyState({ Icon, iconColor, title, body, actionLabel, onAction, children }: Props) {
  return (
    <View style={s.wrap}>
      <IconTile Icon={Icon} color={iconColor} />
      <Text variant="sectionTitle" align="center">
        {title}
      </Text>
      <Text variant="bodySmall" align="center" style={{ maxWidth: 280 }}>
        {body}
      </Text>
      {children}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: space[2] }} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[3], paddingVertical: space[10], paddingHorizontal: space[6] },
});
