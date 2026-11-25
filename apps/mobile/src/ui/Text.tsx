import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { type as typeScale } from '../styles/tokens';

export type TextVariant = keyof typeof typeScale;

interface Props extends TextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

/** Text with a §3.3 typography role. Default: mobile body (Inter 16). */
export function Text({ variant = 'body', color, align, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[typeScale[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}
    />
  );
}
