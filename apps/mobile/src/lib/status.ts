// Outcome and status mapping (DESIGN.md §3.2) — same icon, colour and label everywhere.
import {
  Ban,
  CalendarX2,
  CircleCheck,
  CircleX,
  Link2,
  LoaderCircle,
  ShieldCheck,
  ShieldOff,
  TimerOff,
  Unlink,
  type LucideIcon,
} from 'lucide-react-native';
import { colors } from '../styles/tokens';

export type StatusKind =
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'verified'
  | 'failed'
  | 'declined'
  | 'session-expired'
  | 'pending'
  | 'paired'
  | 'not-paired';

export interface StatusMeta {
  label: string;
  color: string;
  Icon: LucideIcon;
}

export const STATUS: Record<StatusKind, StatusMeta> = {
  valid: { label: 'VALID', color: colors.success, Icon: ShieldCheck },
  expired: { label: 'EXPIRED', color: colors.danger, Icon: CalendarX2 },
  revoked: { label: 'REVOKED', color: colors.textMuted, Icon: ShieldOff },
  verified: { label: 'VERIFIED', color: colors.success, Icon: CircleCheck },
  failed: { label: 'FAILED', color: colors.danger, Icon: CircleX },
  declined: { label: 'DECLINED', color: colors.textMuted, Icon: Ban },
  'session-expired': { label: 'EXPIRED', color: colors.warning, Icon: TimerOff },
  pending: { label: 'PENDING', color: colors.accentText, Icon: LoaderCircle },
  paired: { label: 'PAIRED', color: colors.success, Icon: Link2 },
  'not-paired': { label: 'NOT PAIRED', color: colors.textMuted, Icon: Unlink },
};

/** Backend outcome (FR-045) → status kind. */
export function outcomeStatus(outcome: string | null | undefined): StatusKind {
  switch ((outcome ?? '').toUpperCase()) {
    case 'VERIFIED':
      return 'verified';
    case 'FAILED':
      return 'failed';
    case 'DECLINED':
      return 'declined';
    case 'EXPIRED':
      return 'session-expired';
    default:
      return 'pending';
  }
}
