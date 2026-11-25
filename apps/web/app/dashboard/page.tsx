"use client";

// SCR-014 — End User dashboard (FR-038), Linear style:
//   KPI row (credentials · verifications · paired browsers)
//   Paired browsers & devices, each browser with Revoke (API-026 / API-027)
//   Recent activity (API-038, newest first) → full list on SCR-015.
// Times are relative and computed only on the client (useNow) — no hydration mismatch.

import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowRight,
  History,
  MonitorSmartphone,
  Plus,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/nexus/EmptyState";
import { ErrorState } from "@/components/nexus/ErrorState";
import {
  OutcomeBadge,
  outcomeStateFromVerification,
} from "@/components/nexus/OutcomeBadge";
import { PredicateChip } from "@/components/nexus/PredicateChip";
import { StatCard } from "@/components/nexus/StatCard";
import { useNow } from "@/hooks/use-now";
import { PairedDevices } from "@/components/nexus/PairedDevices";
import { relativeTime as relative } from "@/components/nexus/time";
import {
  useActiveCredentialCount,
  useHistory,
  usePairings,
} from "@/lib/userApi";

const RECENT = 6;

export default function DashboardPage() {
  const now = useNow();
  const credentials = useActiveCredentialCount();
  const pairings = usePairings();
  const history = useHistory();

  const active = pairings.data?.filter((p) => p.status === "paired") ?? [];
  const entries = history.data ?? [];
  const verified = entries.filter((e) => e.outcome === "VERIFIED").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Overview
          </h2>
          <p className="text-sm text-text-muted">
            Your credentials stay on your phone. This page shows what you shared
            and who can ask.
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link href="/dashboard/credentials">
            <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Add credential
          </Link>
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Credentials"
          icon={WalletCards}
          loading={credentials.isLoading}
          value={credentials.isError ? "—" : credentials.data}
          hint={
            credentials.isError ? "Couldn't load" : "Active, on your device"
          }
        />
        <StatCard
          label="Verifications"
          icon={History}
          loading={history.isLoading}
          value={history.isError ? "—" : entries.length}
          hint={
            history.isError
              ? "Couldn't load"
              : `${verified} verified · ${entries.length - verified} not shared`
          }
        />
        <StatCard
          label="Paired browsers"
          icon={MonitorSmartphone}
          loading={pairings.isLoading}
          value={pairings.isError ? "—" : active.length}
          hint={pairings.isError ? "Couldn't load" : "Can send you requests"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PairedDevices now={now} />
        <RecentActivity now={now} />
      </div>
    </div>
  );
}

// ── Recent activity (FR-028) ─────────────────────────────────────────────────

function RecentActivity({ now }: { now: number | null }) {
  const history = useHistory();
  const recent = (history.data ?? []).slice(0, RECENT);

  return (
    <Card className="flex flex-col shadow-none">
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-5">
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-foreground">
            Recent activity
          </h3>
          <p className="text-sm text-text-muted">
            Who asked, what they asked, and the outcome. Never your data.
          </p>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1 text-text-muted hover:text-foreground"
        >
          <Link href="/dashboard/history">
            View all
            <ArrowRight
              className="size-3.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Link>
        </Button>
      </div>

      {history.isLoading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : history.isError ? (
        <ErrorState
          bare
          message={(history.error as Error).message}
          onRetry={() => history.refetch()}
          retrying={history.isFetching}
        />
      ) : recent.length === 0 ? (
        <EmptyState
          bare
          icon={History}
          title="Nothing shared yet"
          description="When a site asks you to prove something, it shows up here."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {recent.map((e) => (
            <li key={e.requestId} className="flex items-center gap-3 px-5 py-3">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-overlay font-display text-sm font-semibold text-foreground"
                aria-hidden="true"
              >
                {e.verifierName.trim()[0]?.toUpperCase() ?? "?"}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {e.verifierName}
                </p>
                <PredicateChip code={e.predicate} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <OutcomeBadge state={outcomeStateFromVerification(e.outcome)} />
                <span className="text-xs text-text-muted">
                  {relative(e.created_at, now)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
