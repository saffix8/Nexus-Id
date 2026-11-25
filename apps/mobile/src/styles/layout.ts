// Responsive layout helpers. Baseline is a 360×640 dp phone (720×1280 @ xhdpi, the
// emulator) up to ~430×930 dp (large phones). Screens read these instead of hard-coding
// sizes so nothing overlaps on small devices and nothing looks sparse on big ones.
import { useWindowDimensions } from 'react-native';

export interface Layout {
  width: number;
  height: number;
  /** ≤ 360 dp wide or < 700 dp tall: tighter spacing, smaller display type. */
  compact: boolean;
  /** < 600 dp tall (landscape-ish / tiny phones): drop decorative blocks. */
  short: boolean;
  /** ≥ 600 dp wide: tablets / foldables — cap content width and centre it. */
  wide: boolean;
  /** Horizontal page padding. */
  pad: number;
  /** Max content width (centred on wide screens). */
  contentWidth: number;
}

export const MAX_CONTENT = 520;

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const compact = width <= 360 || height < 700;
  const short = height < 600;
  const wide = width >= 600;
  const pad = width < 360 ? 16 : compact ? 18 : 20;
  const contentWidth = Math.min(width - pad * 2, MAX_CONTENT);
  return { width, height, compact, short, wide, pad, contentWidth };
}
