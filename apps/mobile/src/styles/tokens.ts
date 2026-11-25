// apps/mobile/src/styles/tokens.ts
// Design tokens — docs/DESIGN.md §3 (SRS v2 Table 4.32). Do not change the hex values.
import type { TextStyle } from 'react-native';
import type { CredentialType } from '@nexusid/types';

export const colors = {
  bg: '#0C0E13',
  surface: '#13161E',
  overlay: '#1A1E28',
  inset: '#0A0C10',
  border: '#252C3D',
  borderSubtle: '#1E2330',
  borderStrong: '#3A4560',
  text: '#EEF0F6',
  textMuted: '#8B92A8',
  /** Placeholders and decorative metadata only — never important text. */
  textFaint: '#525A72',
  /** Fills only (buttons, active nav, focus). White text on it. */
  accent: '#3B6FE8',
  accentHover: '#4A7EF7',
  /** Links and small accent text — passes contrast on bg. */
  accentText: '#7BA0FF',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  white: '#FFFFFF',
  catIdentity: '#3B82F6',
  catEducation: '#8B5CF6',
  catEmployment: '#0EA5E9',
  catEnrollment: '#10B981',
} as const;

export const categoryColor: Record<CredentialType, string> = {
  identity: colors.catIdentity,
  education: colors.catEducation,
  employment: colors.catEmployment,
  enrollment: colors.catEnrollment,
};

/** `#RRGGBB` + alpha 0–1 → `#RRGGBBAA`. Tints are colour/10% fill + colour/25% border (§3.1). */
export function alpha(hex: string, a: number): string {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex.slice(0, 7)}${v}`;
}

/** 4 px grid. Page padding 20, card padding 20, gap between cards 16 (§3.4). */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  page: 20,
} as const;

export const radius = {
  input: 8,
  button: 8,
  card: 12,
  credential: 16,
  sheet: 20,
  full: 9999,
} as const;

/** Bundled in android/app/src/main/assets/fonts — the file name is the family. */
export const fonts = {
  displayMedium: 'DMSans-Medium',
  display: 'DMSans-SemiBold',
  displayBold: 'DMSans-Bold',
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemiBold: 'Inter-SemiBold',
  mono: 'JetBrainsMono-Regular',
  monoMedium: 'JetBrainsMono-Medium',
} as const;

/** §3.3 typography roles. Android picks the weight from the font file, so no fontWeight here. */
export const type = {
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.48,
    color: colors.text,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
  },
  bodySmall: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  kpi: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

/** §3.5 motion. */
export const motion = {
  press: 150,
  enter: 200,
  stagger: 40,
  sheetSpring: { damping: 30, stiffness: 300 },
  checkDraw: 450,
} as const;

/** Only dialogs/sheets get a shadow (§3.4) — borders everywhere else. */
export const sheetShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 16 },
  shadowOpacity: 0.5,
  shadowRadius: 48,
  elevation: 24,
} as const;

/** lucide stroke 1.75; sizes 16 inline / 20 nav / 24 headers / 40 empty states (§3.6). */
export const icon = {
  stroke: 1.75,
  inline: 16,
  nav: 20,
  header: 24,
  empty: 40,
} as const;

/** Timing constants (REQUIREMENTS / mobile rules). */
export const timing = {
  requestTtlSec: 120,
  warnAtSec: 30,
  dangerAtSec: 10,
  stepMinMs: 400,
  pollPendingMs: 3000,
} as const;
