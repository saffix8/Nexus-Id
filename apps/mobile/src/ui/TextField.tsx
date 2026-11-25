import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, radius, space } from '../styles/tokens';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  mono?: boolean;
}

/** Labelled input: inset fill, border, strong border on focus, error under it. */
export function TextField({ label, error, hint, mono, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="eyebrow">{label}</Text>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        onFocus={e => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          s.input,
          { fontFamily: mono ? fonts.mono : fonts.body, borderColor: error ? colors.danger : focused ? colors.accent : colors.border },
          style,
        ]}
      />
      {error ? (
        <Text variant="bodySmall" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="bodySmall">{hint}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    minHeight: 52,
    borderRadius: radius.input,
    borderWidth: 1,
    backgroundColor: colors.inset,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: space[4],
  },
});
