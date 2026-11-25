// CredentialCard (mobile) — docs/DESIGN.md §5.1. The identity-document look.
// Never shows raw attribute values — only predicate labels from packages/types.
import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  Line,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { predicateLabel, type CredentialType } from '@nexusid/types';
import { categoryMeta } from '../lib/category';
import { formatExpiry, truncateId } from '../lib/format';
import type { CredentialUiStatus } from '../lib/wallet';
import { alpha, colors, icon, radius, space } from '../styles/tokens';
import { StatusBadge, Text } from '../ui';

export const CARD_RATIO = 1.586; // ID-1 card

interface Props {
  category: CredentialType;
  status: CredentialUiStatus;
  predicates: string[];
  credentialId: string;
  expiresAt: string;
  issuerName?: string;
  width: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function CredentialCard({
  category,
  status,
  predicates,
  credentialId,
  expiresAt,
  issuerName,
  width,
  onPress,
  style,
}: Props) {
  const meta = categoryMeta(category);
  const { Icon } = meta;
  const height = width / CARD_RATIO;
  const revoked = status === 'revoked';
  const expired = status === 'expired';
  const issuer = issuerName ?? meta.issuerName;
  const patternId = `g-${category}`;
  const glowId = `r-${category}`;

  const body = (
    <View style={[s.card, { width, height, opacity: revoked ? 0.6 : 1 }]}>
      {/* Background: radial glow top-right (8%) + guilloche 45° lines (4%) */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient
            id={glowId}
            cx={width}
            cy={0}
            rx={width * 0.75}
            ry={width * 0.75}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={meta.color} stopOpacity={0.14} />
            <Stop offset="1" stopColor={meta.color} stopOpacity={0} />
          </RadialGradient>
          <Pattern
            id={patternId}
            width={10}
            height={10}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Line
              x1={0}
              y1={0}
              x2={0}
              y2={10}
              stroke={meta.color}
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${patternId})`} />
        <Rect width={width} height={height} fill={`url(#${glowId})`} />
      </Svg>

      {/* Category strip */}
      <View style={[s.strip, { backgroundColor: meta.color }]} />

      <View style={s.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="eyebrow"
            color={meta.color}
            style={revoked && s.strike}
          >
            {meta.label}
          </Text>
          <Text variant="label" numberOfLines={1} style={revoked && s.strike}>
            {issuer}
          </Text>
        </View>
        <StatusBadge status={status} />
      </View>

      <View style={s.middle}>
        <View
          style={[s.iconTile, { backgroundColor: alpha(meta.color, 0.15) }]}
        >
          <Icon
            size={icon.empty * 0.85}
            color={meta.color}
            strokeWidth={icon.stroke}
          />
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <Text variant="eyebrow">Confirms</Text>
        <Text variant="bodySmall" color={colors.text} numberOfLines={1}>
          {predicates.length ? predicates.map(predicateLabel).join(' · ') : '—'}
        </Text>
      </View>

      <View style={s.footer}>
        <Text variant="mono">
          <Text variant="mono" color={colors.textFaint}>
            ID{'  '}
          </Text>
          {truncateId(credentialId)}
        </Text>
        <Text variant="mono" color={expired ? colors.danger : colors.textMuted}>
          <Text
            variant="mono"
            color={expired ? colors.danger : colors.textFaint}
          >
            EXPIRES{'  '}
          </Text>
          {formatExpiry(expiresAt)}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label} credential from ${issuer}, ${status}, expires ${formatExpiry(expiresAt)}`}
      accessibilityHint="Opens credential details"
      style={({ pressed }) => [
        style,
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.credential,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    padding: space[5],
    paddingLeft: space[6],
  },
  strip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  middle: { flex: 1, justifyContent: 'center' },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space[3],
  },
  strike: { textDecorationLine: 'line-through' },
});
