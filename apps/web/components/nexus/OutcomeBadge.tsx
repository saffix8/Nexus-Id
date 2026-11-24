// Outcome and status mapping — DESIGN.md §3.2. Every state has icon + label + colour.
// Server-safe (no hooks, no time).

import {
  Ban,
  CalendarX2,
  CircleCheck,
  CircleX,
  Link2,
  Loader2,
  ShieldCheck,
  ShieldOff,
  TimerOff,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import type { VerificationOutcome } from "@nexusid/types";
import { cn } from "@/lib/utils";

export type OutcomeState =
  | "valid"
  | "expired"
  | "revoked"
  | "verified"
  | "failed"
  | "declined"
  | "session-expired"
  | "pending"
  | "paired"
  | "not-paired";

interface StateSpec {
  label: string;
  Icon: LucideIcon;
  className: string;
}

const MUTED = "bg-text-muted/10 border-text-muted/25 text-text-muted";

export const OUTCOME_STATES: Record<OutcomeState, StateSpec> = {
  valid: { label: "VALID", Icon: ShieldCheck, className: "bg-success/10 border-success/25 text-success" },
  expired: { label: "EXPIRED", Icon: CalendarX2, className: "bg-danger/10 border-danger/25 text-danger" },
  revoked: { label: "REVOKED", Icon: ShieldOff, className: MUTED },
  verified: { label: "VERIFIED", Icon: CircleCheck, className: "bg-success/10 border-success/25 text-success" },
  failed: { label: "FAILED", Icon: CircleX, className: "bg-danger/10 border-danger/25 text-danger" },
  declined: { label: "DECLINED", Icon: Ban, className: MUTED },
  "session-expired": { label: "EXPIRED", Icon: TimerOff, className: "bg-warning/10 border-warning/25 text-warning" },
  pending: { label: "PENDING", Icon: Loader2, className: "bg-accent-text/10 border-accent-text/25 text-accent-text" },
  paired: { label: "PAIRED", Icon: Link2, className: "bg-success/10 border-success/25 text-success" },
  "not-paired": { label: "NOT PAIRED", Icon: Unlink, className: MUTED },
};

/** Backend session outcome (API-031) → badge state. */
export function outcomeStateFromVerification(outcome: VerificationOutcome): OutcomeState {
  switch (outcome) {
    case "VERIFIED":
      return "verified";
    case "FAILED":
      return "failed";
    case "DECLINED":
      return "declined";
    case "EXPIRED":
      return "session-expired";
    default:
      return "pending";
  }
}

interface OutcomeBadgeProps {
  state: OutcomeState;
  /** Pending only: pulsing dot instead of the spinner. */
  variant?: "icon" | "dot";
  className?: string;
}

export function OutcomeBadge({ state, variant = "icon", className }: OutcomeBadgeProps) {
  const { label, Icon, className: tone } = OUTCOME_STATES[state];
  const isPending = state === "pending";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5",
        "text-[11px] font-medium uppercase tracking-[0.08em]",
        tone,
        className,
      )}
    >
      {isPending && variant === "dot" ? (
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      ) : (
        <Icon
          className={cn("size-3.5 shrink-0", isPending && "motion-safe:animate-spin")}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}
