"use client";

// SCR-018 — Service Provider dashboard (FR-042, DESIGN.md §6.1).
// KPI row (API-047) · 7-day chart · live log (API-048, polled every 3 s) · integration snippet.
// FR-042 AC2 / BR-015: nothing on this page identifies an End User.

import { useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ArrowRight,
  ListChecks,
  Percent,
  TriangleAlert,
} from "lucide-react";
import { isPredicateCode } from "@nexusid/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ErrorState,
  LiveLogTable,
  PredicateChip,
  PageHeader,
  StatCard,
  StatGroup,
} from "@/components/nexus";
import { VerifierIntegrationCode } from "@/components/VerifierIntegrationCode";
import {
  useRecentVerifications,
  useRequirements,
  useVerificationStats,
  type VerificationStats,
} from "@/lib/verifierApi";

const nf = new Intl.NumberFormat("en-US");

export default function ProviderDashboardPage() {
  const stats = useVerificationStats();
  const recent = useRecentVerifications(20);
  const requirements = useRequirements();

  const s = stats.data;
  const notMet = s ? s.failed + s.declined + s.expired : undefined;
  const configured = requirements.data?.predicates ?? [];
  const snippetPredicate = configured.find(isPredicateCode) ?? "AGE_OVER_18";

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Overview"
        description="Every verification your site has opened. You only ever see the outcome, never the person's data."
        actions={
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href="/verifier/integration">
              Integration guide
              <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      {requirements.isSuccess && configured.length === 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-sm text-warning">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>
              <span className="font-medium">No conditions configured.</span>{" "}
              <span className="text-text-muted">
                Sessions are refused until you choose what to verify.
              </span>
            </span>
          </p>
          <Button asChild size="sm">
            <Link href="/verifier/requirements">Choose conditions</Link>
          </Button>
        </div>
      )}

      {stats.isError ? (
        <ErrorState
          title="Couldn't load your totals"
          message={stats.error.message}
          onRetry={() => stats.refetch()}
          retrying={stats.isFetching}
        />
      ) : (
        <StatGroup cols={4}>
          <StatCard
            label="Total verifications"
            tone="accent"
            value={s && nf.format(s.total)}
            loading={stats.isPending}
            hint={s && s.pending > 0 ? `${s.pending} pending now` : "All time"}
          />
          <StatCard
            label="Verified"
            tone="success"
            value={s && nf.format(s.verified)}
            loading={stats.isPending}
            hint="Condition confirmed"
          />
          <StatCard
            label="Not met"
            tone="danger"
            value={notMet === undefined ? undefined : nf.format(notMet)}
            loading={stats.isPending}
            hint={
              s &&
              `${s.failed} failed · ${s.declined} declined · ${s.expired} expired`
            }
          />
          <StatCard
            label="Success rate"
            icon={Percent}
            value={
              s
                ? s.successRate === null
                  ? "—"
                  : `${s.successRate}%`
                : undefined
            }
            loading={stats.isPending}
            hint="Of decided sessions"
          />
        </StatGroup>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <VolumeChart
            data={s?.daily}
            loading={stats.isPending}
            hidden={stats.isError}
          />

          <LiveLogTable
            title="Recent verifications"
            live
            rows={recent.data?.map((r) => ({
              id: r.id,
              createdAt: r.createdAt,
              sessionId: r.sessionId,
              predicate: r.predicate,
              outcome: r.outcome,
              proofHash: r.proofHash,
            }))}
            loading={recent.isPending}
            error={recent.isError ? recent.error.message : null}
            onRetry={() => recent.refetch()}
          />
        </div>

        <aside className="min-w-0 space-y-6">
          <Card className="space-y-4 p-4 sm:p-5">
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-foreground">
                Integrate in 2 minutes
              </h2>
              <p className="text-sm text-text-muted">
                Open a session on your server, drop the tag on your page. The
                NexusID extension does the rest.
              </p>
            </div>
            <VerifierIntegrationCode
              predicate={snippetPredicate}
              steps={["session", "page"]}
            />
            <Link
              href="/verifier/integration"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
            >
              Read the outcome on your server
              <ArrowRight
                className="size-3.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Link>
          </Card>

          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-foreground">
                Conditions you verify
              </h2>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-text-muted hover:text-foreground"
              >
                <Link href="/verifier/requirements">Edit</Link>
              </Button>
            </div>
            {requirements.isPending ? (
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
            ) : requirements.isError ? (
              <p className="text-sm text-danger">
                {requirements.error.message}
              </p>
            ) : configured.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <ListChecks
                  className="size-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                None yet
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {configured.map((c) => (
                  <PredicateChip key={c} code={c} />
                ))}
              </div>
            )}
            <p className="text-xs text-text-muted">
              Only the answer is shared. Never the user&apos;s data.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ── 7-day volume chart ───────────────────────────────────────────────────────

const chartConfig = {
  verified: { label: "Verified", color: "#22C55E" },
  notMet: { label: "Failed · Declined · Expired", color: "#EF4444" },
} satisfies ChartConfig;

function VolumeChart({
  data,
  loading,
  hidden,
}: {
  data?: VerificationStats["daily"];
  loading: boolean;
  hidden: boolean;
}) {
  // Memoised + no animation: the 3 s poll must not restart the draw-in.
  const rows = useMemo(
    () =>
      data?.map((d) => ({
        day: format(parseISO(d.date), "EEE d"),
        verified: d.verified,
        notMet: d.failed + d.declined + d.expired,
      })),
    [data],
  );
  if (hidden) return null;
  const empty =
    rows !== undefined && rows.every((r) => r.verified === 0 && r.notMet === 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-base font-semibold text-foreground">
          Verifications, last 7 days
        </h2>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full bg-success"
              aria-hidden="true"
            />{" "}
            Verified
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full bg-danger"
              aria-hidden="true"
            />{" "}
            Not met
          </span>
        </div>
      </div>
      {loading || !rows ? (
        <Skeleton className="h-[180px] w-full sm:h-[220px]" />
      ) : (
        <div className="relative">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[180px] w-full sm:h-[220px]"
          >
            <BarChart
              data={rows}
              margin={{ left: 0, right: 4, top: 8, bottom: 0 }}
              barCategoryGap="36%"
              maxBarSize={36}
            >
              <CartesianGrid
                vertical={false}
                stroke="hsl(var(--border))"
                strokeOpacity={0.6}
              />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={24}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Bar
                dataKey="verified"
                stackId="v"
                isAnimationActive={false}
                fill="var(--color-verified)"
                fillOpacity={0.8}
                radius={[0, 0, 2, 2]}
              />
              <Bar
                dataKey="notMet"
                stackId="v"
                isAnimationActive={false}
                fill="var(--color-notMet)"
                fillOpacity={0.7}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
          {empty && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-text-muted">
              No verifications in the last 7 days
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
