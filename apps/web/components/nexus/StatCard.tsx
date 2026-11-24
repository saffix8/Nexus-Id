// StatCard on shadcn Card — DESIGN.md §3.3 (eyebrow label + KPI number), §3.4 (border, no shadow).

import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value?: string | number;
  icon?: LucideIcon;
  /** e.g. "+12% vs last week" */
  change?: string;
  trend?: "up" | "down" | "neutral";
  /** Small muted line under the value, e.g. a breakdown. */
  hint?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

const TREND = {
  up: { Icon: TrendingUp, className: "text-success" },
  down: { Icon: TrendingDown, className: "text-danger" },
  neutral: { Icon: Minus, className: "text-text-muted" },
} as const;

export function StatCard({ label, value, icon: Icon, change, trend = "neutral", hint, loading, className }: StatCardProps) {
  const t = TREND[trend];

  return (
    <Card className={cn("flex flex-col gap-3 p-5 shadow-none", className)} aria-busy={loading || undefined}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">{label}</span>
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-lg bg-overlay text-text-muted">
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3">
          <span className="font-display text-[32px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">
            {value ?? "—"}
          </span>
          {change && (
            <span className={cn("inline-flex items-center gap-1 text-sm font-medium", t.className)}>
              <t.Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {change}
            </span>
          )}
        </div>
      )}
      {!loading && hint && <div className="text-xs text-text-muted">{hint}</div>}
    </Card>
  );
}
