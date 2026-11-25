import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, sheetShadow, space } from '../styles/tokens';
import { Button } from './Button';
import { Text } from './Text';

interface Props {
  visible: boolean;
  /** Action question, e.g. "Delete this credential?" (§8). */
  title: string;
  /** The consequence. */
  body: string;
  /** Says the action, e.g. "Delete credential". Never "OK". */
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ visible, title, body, confirmLabel, destructive, loading, onConfirm, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={s.scrim} onPress={onCancel} accessibilityLabel="Close dialog">
        <Pressable style={s.card} onPress={() => {}} accessibilityViewIsModal>
          <Text variant="sectionTitle" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="bodySmall">{body}</Text>
          <View style={s.row}>
            <Button label="Cancel" variant="secondary" size="md" onPress={onCancel} style={{ flex: 1 }} />
            <Button label={confirmLabel} variant={destructive ? 'danger' : 'primary'} size="md" loading={loading} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(5,6,9,0.72)', justifyContent: 'center', padding: space[6] },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space[5], gap: space[3], ...sheetShadow },
  row: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
});
