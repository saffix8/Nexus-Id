// StatCard / StatGroup — DESIGN.md §3.3 (label + KPI number), §3.4 (borders, no shadow).
// A StatGroup is one bordered strip with hairline dividers (Stripe-style): 2 columns on phones,
// `cols` from `lg` up. StatCards inside it render bare.

import { createContext, useContext } from "react";
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const InGroup = createContext(false);

const COLS = {
  2: "lg:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "lg:grid-cols-4",
} as const;

export function StatGroup({
  children,
  cols = 4,
  className,
}: {
  children: React.ReactNode;
  cols?: keyof typeof COLS;
  className?: string;
}) {
  return (
    <InGroup.Provider value={true}>
      <div
        className={cn(
          "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border",
          COLS[cols],
          // An odd last item spans the row on phones so there is no empty cell.
          "[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
          className,
        )}
      >
        {children}
      </div>
    </InGroup.Provider>
  );
}

interface StatCardProps {
  label: string;
  value?: string | number;
  icon?: LucideIcon;
  /** e.g. "+12% vs last week" */
  change?: string;
  trend?: "up" | "down" | "neutral";
  /** Small muted line under the value, e.g. a breakdown. */
  hint?: React.ReactNode;
  /** Colour of the small dot before the label (semantic KPIs). */
  tone?: "success" | "danger" | "warning" | "accent";
  loading?: boolean;
  className?: string;
}

const TREND = {
  up: { Icon: TrendingUp, className: "text-success" },
  down: { Icon: TrendingDown, className: "text-danger" },
  neutral: { Icon: Minus, className: "text-text-muted" },
} as const;

const TONE = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-primary",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  change,
  trend = "neutral",
  hint,
  tone,
  loading,
  className,
}: StatCardProps) {
  const grouped = useContext(InGroup);
  const t = TREND[trend];

  const body = (
    <>
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-text-muted">
        {tone ? (
          <span
            className={cn("size-1.5 shrink-0 rounded-full", TONE[tone])}
            aria-hidden="true"
          />
        ) : Icon ? (
          <Icon
            className="size-3.5 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : null}
        <span className="truncate">{label}</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-foreground sm:text-[32px]">
              {value ?? "—"}
            </span>
            {change && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[13px] font-medium",
                  t.className,
                )}
              >
                <t.Icon
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {change}
              </span>
            )}
          </div>
          {hint && (
            <div className="text-xs leading-snug text-text-muted">{hint}</div>
          )}
        </div>
      )}
    </>
  );

  if (grouped) {
    return (
      <div
        className={cn(
          "flex min-w-0 flex-col gap-4 bg-card p-4 sm:p-5",
          className,
        )}
        aria-busy={loading || undefined}
      >
        {body}
      </div>
    );
  }
  return (
    <Card
      className={cn("flex flex-col gap-4 p-4 sm:p-5", className)}
      aria-busy={loading || undefined}
    >
      {body}
    </Card>
  );
}
