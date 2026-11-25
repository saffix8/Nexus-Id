"use client";

// SCR-014 — End User dashboard (FR-038), Linear style:
//   KPI row (credentials · verifications · paired browsers)
//   Paired browsers & devices, each browser with Revoke (API-026 / API-027)
//   Recent activity (API-038, newest first) → full list on SCR-015.
// Times are relative and computed only on the client (useNow) — no hydration mismatch.

import { useState } from "react";
import Link from "next/link";
import { format, formatDistanceStrict } from "date-fns";
import {
  ArrowRight,
  History,
  Loader2,
  Monitor,
  MonitorSmartphone,
  Plus,
  Smartphone,
  Unlink,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/nexus/EmptyState";
import { ErrorState } from "@/components/nexus/ErrorState";
import {
  OutcomeBadge,
  outcomeStateFromVerification,
} from "@/components/nexus/OutcomeBadge";
import { PredicateChip } from "@/components/nexus/PredicateChip";
import { StatCard } from "@/components/nexus/StatCard";
import { truncateId } from "@/components/nexus/format";
import { useNow } from "@/hooks/use-now";
import {
  useActiveCredentialCount,
  useHistory,
  useMe,
  usePairings,
  useRevokePairing,
  type Pairing,
} from "@/lib/userApi";

const RECENT = 6;

function relative(iso: string | null, now: number | null): string {
  if (!iso) return "—";
  if (now === null) return "…";
  const t = new Date(iso).getTime();
  return now - t < 10_000
    ? "just now"
    : formatDistanceStrict(t, now, { addSuffix: true });
}

function browserName(p: Pairing) {
  return p.browser ?? "Browser extension";
}

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

// ── Paired browsers & devices (FR-038) ───────────────────────────────────────

function PairedDevices({ now }: { now: number | null }) {
  const me = useMe();
  const pairings = usePairings();
  const revoke = useRevokePairing();
  const [target, setTarget] = useState<Pairing | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  const all = pairings.data ?? [];
  const active = all.filter((p) => p.status === "paired");
  const revoked = all.filter((p) => p.status === "revoked");
  const listed = showRevoked ? [...active, ...revoked] : active;

  function confirmRevoke() {
    if (!target) return;
    const name = browserName(target);
    revoke.mutate(target.pairingId, {
      onSuccess: () => {
        toast.success(`${name} revoked`, {
          description: "Its requests no longer reach your phone.",
        });
        setTarget(null);
      },
      onError: (err) =>
        toast.error("Couldn't revoke", { description: (err as Error).message }),
    });
  }

  return (
    <Card className="flex flex-col shadow-none">
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-5">
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-foreground">
            Paired browsers & devices
          </h3>
          <p className="text-sm text-text-muted">
            Browsers whose NexusID extension can send requests to your phone.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <Link href="/dashboard/devices">Pair a browser</Link>
        </Button>
      </div>

      {/* Your phone — the device key every proof is signed with */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-overlay text-text-muted">
          <Smartphone
            className="size-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          {me.isLoading ? (
            <Skeleton className="h-4 w-40" />
          ) : (
            <>
              <p className="truncate text-sm font-medium text-foreground">
                {me.data?.deviceName ?? "Your phone"}
                <span className="ml-2 text-xs font-normal text-text-faint">
                  this account&apos;s device key
                </span>
              </p>
              <p className="text-xs text-text-muted">
                {me.data?.publicKey
                  ? "Signs every proof. The key never leaves the device."
                  : "No device key yet. Sign in on the NexusID app."}
              </p>
            </>
          )}
        </div>
        {!me.isLoading && (
          <OutcomeBadge state={me.data?.publicKey ? "paired" : "not-paired"} />
        )}
      </div>

      {pairings.isLoading ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : pairings.isError ? (
        <ErrorState
          bare
          message={(pairings.error as Error).message}
          onRetry={() => pairings.refetch()}
          retrying={pairings.isFetching}
        />
      ) : listed.length === 0 ? (
        <EmptyState
          bare
          icon={Unlink}
          title="No paired browsers"
          description="Open the NexusID extension in Chrome and scan its code with your phone."
          action={{ label: "Pair a browser", href: "/dashboard/devices" }}
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {listed.map((p) => {
            const isActive = p.status === "paired";
            const when = isActive ? p.pairedAt : p.revokedAt;
            return (
              <li
                key={p.pairingId}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-overlay text-text-muted">
                  <Monitor
                    className="size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      isActive
                        ? "truncate text-sm font-medium text-foreground"
                        : "truncate text-sm text-text-muted"
                    }
                  >
                    {browserName(p)}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-text-muted">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="cursor-default">
                          {isActive ? "Paired" : "Revoked"}{" "}
                          {relative(when, now)}
                        </span>
                      </TooltipTrigger>
                      {when && (
                        <TooltipContent>
                          {now === null
                            ? ""
                            : format(new Date(when), "d MMM yyyy, HH:mm")}
                        </TooltipContent>
                      )}
                    </Tooltip>
                    <span className="font-mono text-text-faint">
                      {truncateId(p.pairingId, 8, 4)}
                    </span>
                  </p>
                </div>
                {isActive ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
                    onClick={() => setTarget(p)}
                  >
                    Revoke
                  </Button>
                ) : (
                  <OutcomeBadge state="revoked" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {revoked.length > 0 && !pairings.isError && (
        <div className="mt-auto border-t border-border-subtle px-5 py-3">
          <button
            type="button"
            onClick={() => setShowRevoked((v) => !v)}
            className="text-xs text-text-muted hover:text-foreground"
          >
            {showRevoked ? "Hide revoked" : `Show ${revoked.length} revoked`}
          </button>
        </div>
      )}

      <AlertDialog
        open={target !== null}
        onOpenChange={(o) => !revoke.isPending && !o && setTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke {target ? browserName(target) : "this browser"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Requests from that browser stop reaching your phone immediately.
              You can pair it again any time with a new code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // stay open until the request finishes
                confirmRevoke();
              }}
              disabled={revoke.isPending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {revoke.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {revoke.isPending ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
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
