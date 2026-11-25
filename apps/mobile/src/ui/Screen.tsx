import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, space } from '../styles/tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface Props {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Skip the bottom inset (screens above the tab bar). */
  noBottomInset?: boolean;
}

/** Page frame: bg, safe area, optional header with back button. */
export function Screen({ children, title, eyebrow, onBack, right, style, noBottomInset }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: noBottomInset ? 0 : insets.bottom }]}>
      {title || onBack ? (
        <View style={s.header}>
          {onBack ? <IconButton Icon={ChevronLeft} label="Back" onPress={onBack} /> : null}
          <View style={{ flex: 1, paddingLeft: onBack ? space[1] : 0 }}>
            {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
            {title ? (
              <Text variant="pageTitle" accessibilityRole="header" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.page, paddingTop: space[2], gap: space[2] },
});
