import React from 'react';
import { StatusBar, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, space } from '../styles/tokens';
import { MAX_CONTENT, useLayout } from '../styles/layout';
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

/**
 * Page frame: bg, safe area, optional header with back button.
 * Phones: full width. Tablets / foldables (≥ 600 dp): content capped at 520 dp and centred.
 * Compact phones (≤ 360 dp wide or < 700 dp tall): smaller title, tighter header.
 */
export function Screen({ children, title, eyebrow, onBack, right, style, noBottomInset }: Props) {
  const insets = useSafeAreaInsets();
  const { compact, wide } = useLayout();
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: noBottomInset ? 0 : insets.bottom }]}>
      <StatusBar barStyle="light-content" />
      <View style={[s.column, wide && s.wideColumn]}>
        {title || onBack ? (
          <View style={[s.header, compact && s.headerCompact, onBack && { paddingLeft: space[2] }]}>
            {onBack ? <IconButton Icon={ChevronLeft} label="Back" onPress={onBack} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
              {title ? (
                <Text
                  variant="pageTitle"
                  accessibilityRole="header"
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={compact ? s.titleCompact : undefined}
                >
                  {title}
                </Text>
              ) : null}
            </View>
            {right}
          </View>
        ) : null}
        <View style={[{ flex: 1 }, style]}>{children}</View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, width: '100%' },
  wideColumn: { maxWidth: MAX_CONTENT + space.page * 2, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: space.page,
    paddingTop: space[3],
    paddingBottom: space[1],
    gap: space[2],
  },
  headerCompact: { minHeight: 52, paddingTop: space[2] },
  titleCompact: { fontSize: 22, lineHeight: 28, letterSpacing: -0.44 },
});
