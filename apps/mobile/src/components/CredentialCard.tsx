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
import { alpha, colors, fonts, icon, radius, space } from '../styles/tokens';
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
  const compact = width < 330;
  const revoked = status === 'revoked';
  const expired = status === 'expired';
  const issuer = issuerName ?? meta.issuerName;
  const patternId = `g-${category}`;
  const glowId = `r-${category}`;

  const body = (
    <View style={[s.card, { width, height, opacity: revoked ? 0.6 : 1, padding: compact ? space[4] : space[5] }]}>
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
            <Stop offset="0" stopColor={meta.color} stopOpacity={0.2} />
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

      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.emblem, { backgroundColor: alpha(meta.color, 0.12), borderColor: alpha(meta.color, 0.3) }]}>
            <Icon size={16} color={meta.color} strokeWidth={icon.stroke} />
          </View>
          <Text variant="eyebrow" color={meta.color} numberOfLines={1} style={[{ flexShrink: 1 }, revoked && s.strike]}>
            {meta.label}
          </Text>
        </View>
        <StatusBadge status={status} compact={compact} />
      </View>

      <View style={s.middle}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
            style={[s.issuer, compact && s.issuerCompact, revoked && s.strike]}
          >
            {issuer}
          </Text>
          <Text variant="bodySmall" numberOfLines={1} maxFontSizeMultiplier={1.15} style={s.sub}>
            Verifiable credential · SD-JWT
          </Text>
        </View>
        {/* contact chip — the "document" cue */}
        <View style={s.chipArt} accessibilityElementsHidden importantForAccessibility="no">
          <View style={s.chipLine} />
          <View style={s.chipLine} />
        </View>
      </View>

      <View style={s.preds} accessibilityLabel={`Confirms ${predicates.map(predicateLabel).join(', ')}`}>
        {predicates.length ? (
          predicates.map(p => (
            <View key={p} style={s.pred}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={s.predText}>
                {predicateLabel(p)}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="bodySmall">No conditions</Text>
        )}
      </View>

      <View style={s.footer}>
        <Text variant="mono" numberOfLines={1} maxFontSizeMultiplier={1.1} style={s.footText}>
          <Text variant="mono" color={colors.textFaint} style={s.footText}>
            ID{'  '}
          </Text>
          {truncateId(credentialId)}
        </Text>
        <Text variant="mono" maxFontSizeMultiplier={1.1} color={expired ? colors.danger : colors.textMuted} style={s.footText}>
          <Text variant="mono" color={expired ? colors.danger : colors.textFaint} style={s.footText}>
            EXP{'  '}
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
    justifyContent: 'space-between',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space[2], flex: 1, minWidth: 0 },
  emblem: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  middle: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3] },
  issuer: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2, color: colors.text },
  issuerCompact: { fontSize: 18, lineHeight: 24 },
  sub: { fontSize: 12, lineHeight: 16 },
  chipArt: {
    width: 34,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 5,
    marginBottom: 2,
  },
  chipLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.16)' },
  preds: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, overflow: 'hidden', height: 22 },
  pred: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    justifyContent: 'center',
    height: 22,
  },
  predText: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14, color: colors.text },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[3],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: space[2],
  },
  footText: { fontSize: 11, lineHeight: 14 },
  strike: { textDecorationLine: 'line-through' },
});
