"use client";

// SCR-015 — End User verification history (FR-028–FR-030), Stripe payments style.
//   Table + filters (All / Verified / Declined / Expired), newest first (FR-028 AC2)
//   Row → side Sheet with details: platform, condition, date and time, outcome (FR-029)
//   Delete one (API-039) or clear all (API-040), both behind an AlertDialog (FR-030 AC3).
// Deleting hides the entry here and on the phone; the SP log and audit log keep it (BR-023).
// No claim value is ever shown — the API has none (FR-028 AC3, BR-015).
// Times are computed only on the client (useNow) — no hydration mismatch.

import { useMemo, useState } from "react";
import { format, formatDistanceStrict } from "date-fns";
import { History, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { VerificationOutcome } from "@nexusid/types";
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
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/nexus/EmptyState";
import { PageHeader } from "@/components/nexus/PageHeader";
import { ErrorState } from "@/components/nexus/ErrorState";
import {
  OutcomeBadge,
  outcomeStateFromVerification,
} from "@/components/nexus/OutcomeBadge";
import { PredicateChip } from "@/components/nexus/PredicateChip";
import { truncateId } from "@/components/nexus/format";
import { useNow } from "@/hooks/use-now";
import {
  useClearHistory,
  useDeleteHistoryEntry,
  useHistory,
  type HistoryEntry,
} from "@/lib/userApi";

type Filter =
  "ALL" | Extract<VerificationOutcome, "VERIFIED" | "DECLINED" | "EXPIRED">;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "VERIFIED", label: "Verified" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
];

function relative(iso: string, now: number) {
  const t = new Date(iso).getTime();
  return now - t < 10_000
    ? "just now"
    : formatDistanceStrict(t, now, { addSuffix: true });
}

function absolute(iso: string) {
  return format(new Date(iso), "d MMM yyyy, HH:mm:ss");
}

export default function HistoryPage() {
  const now = useNow();
  const history = useHistory();
  const remove = useDeleteHistoryEntry();
  const clear = useClearHistory();

  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [toDelete, setToDelete] = useState<HistoryEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const entries = useMemo(() => history.data ?? [], [history.data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      ALL: entries.length,
      VERIFIED: 0,
      DECLINED: 0,
      EXPIRED: 0,
    };
    for (const e of entries) if (e.outcome in c) c[e.outcome as Filter] += 1;
    return c;
  }, [entries]);
  const rows =
    filter === "ALL" ? entries : entries.filter((e) => e.outcome === filter);

  function deleteEntry() {
    if (!toDelete) return;
    const name = toDelete.verifierName;
    remove.mutate(toDelete.requestId, {
      onSuccess: () => {
        toast.success("Entry deleted", {
          description: `Removed ${name} from your history on every device.`,
        });
        if (selected?.requestId === toDelete.requestId) setSelected(null);
        setToDelete(null);
      },
      onError: (err) =>
        toast.error("Couldn't delete", { description: (err as Error).message }),
    });
  }

  function clearAll() {
    clear.mutate(undefined, {
      onSuccess: ({ deleted }) => {
        toast.success("History cleared", {
          description: `${deleted} ${deleted === 1 ? "entry" : "entries"} removed from your phone and this portal.`,
        });
        setSelected(null);
        setConfirmClear(false);
      },
      onError: (err) =>
        toast.error("Couldn't clear history", {
          description: (err as Error).message,
        }),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="Every request routed to you. The same list shows on your phone."
        actions={
        <Button
          variant="ghost"
          className="gap-1.5 text-danger hover:bg-danger/10 hover:text-danger"
          disabled={entries.length === 0}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Clear all
        </Button>
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="scrollbar-none max-w-full justify-start overflow-x-auto">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
              {f.label}
              {!history.isLoading && (
                <span className="font-mono text-xs tabular-nums text-text-muted">
                  {counts[f.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        {history.isLoading ? (
          <div className="space-y-3 p-5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
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
        ) : rows.length === 0 ? (
          <EmptyState
            bare
            icon={History}
            title={
              entries.length === 0
                ? "No history yet"
                : `No ${filter.toLowerCase()} requests`
            }
            description={
              entries.length === 0
                ? "When a site asks you to prove something, the request and its outcome show up here."
                : "Try another filter."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Platform</TableHead>
                <TableHead className="hidden sm:table-cell">Condition</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="hidden md:table-cell">When</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow
                  key={e.requestId}
                  onClick={() => setSelected(e)}
                  className="cursor-pointer"
                  data-state={
                    selected?.requestId === e.requestId ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelected(e);
                      }}
                      className="flex items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-overlay font-display text-sm font-semibold text-foreground"
                        aria-hidden="true"
                      >
                        {e.verifierName.trim()[0]?.toUpperCase() ?? "?"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {e.verifierName}
                        </span>
                        <span className="num block text-xs text-text-muted md:hidden">
                          {now === null ? "…" : relative(e.created_at, now)}
                        </span>
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <PredicateChip code={e.predicate} />
                  </TableCell>
                  <TableCell>
                    <OutcomeBadge
                      state={outcomeStateFromVerification(e.outcome)}
                    />
                  </TableCell>
                  <TableCell className="num hidden whitespace-nowrap text-text-muted md:table-cell">
                    {now === null ? "…" : relative(e.created_at, now)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-text-muted hover:bg-danger/10 hover:text-danger"
                      aria-label={`Delete ${e.verifierName} entry`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setToDelete(e);
                      }}
                    >
                      <Trash2
                        className="size-4"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Details (FR-029) */}
      <Sheet
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <SheetContent className="flex w-full flex-col gap-6 sm:max-w-md">
          {selected && (
            <>
              <SheetHeader className="space-y-3 text-left">
                <span
                  className="flex size-12 items-center justify-center rounded-xl bg-overlay font-display text-lg font-semibold text-foreground"
                  aria-hidden="true"
                >
                  {selected.verifierName.trim()[0]?.toUpperCase() ?? "?"}
                </span>
                <SheetTitle className="font-display text-xl">
                  {selected.verifierName}
                </SheetTitle>
                <SheetDescription>
                  {now === null
                    ? ""
                    : `Asked ${relative(selected.created_at, now)}`}
                </SheetDescription>
              </SheetHeader>

              <dl className="space-y-4 text-sm">
                <Detail label="Outcome">
                  <OutcomeBadge
                    state={outcomeStateFromVerification(selected.outcome)}
                  />
                </Detail>
                <Detail label="Condition">
                  <span className="flex flex-col items-end gap-1">
                    <PredicateChip code={selected.predicate} />
                    <span className="font-mono text-xs text-text-muted">
                      {selected.predicate}
                    </span>
                  </span>
                </Detail>
                <Detail label="Requested">
                  {absolute(selected.created_at)}
                </Detail>
                <Detail label="Answered">
                  {selected.decidedAt ? (
                    absolute(selected.decidedAt)
                  ) : (
                    <span className="text-text-muted">No answer</span>
                  )}
                </Detail>
                {selected.issuer && (
                  <Detail label="Proved with">{selected.issuer}</Detail>
                )}
                <Detail label="Request ID">
                  <span
                    className="font-mono text-xs"
                    title={selected.requestId}
                  >
                    {truncateId(selected.requestId, 8, 6)}
                  </span>
                </Detail>
              </dl>

              <Separator />

              <div className="flex gap-3 rounded-lg border border-border bg-inset p-4 text-sm text-text-muted">
                <ShieldCheck
                  className="size-5 shrink-0 text-success"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p>
                  {selected.outcome === "VERIFIED"
                    ? `${selected.verifierName} learned only “${selected.predicateLabel}: yes”. Nothing else was shared.`
                    : `${selected.verifierName} learned nothing about you from this request.`}
                </p>
              </div>

              <div className="mt-auto">
                <Button
                  variant="ghost"
                  className="w-full gap-1.5 text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => setToDelete(selected)}
                >
                  <Trash2
                    className="size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Delete from history
                </Button>
                <p className="mt-2 text-center text-xs text-text-muted">
                  {selected.verifierName} keeps its own record of the outcome.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete one (API-039) */}
      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(o) => !remove.isPending && !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              The {toDelete?.verifierName} request disappears from your phone
              and this portal. {toDelete?.verifierName} keeps its own record of
              the outcome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteEntry();
              }}
              disabled={remove.isPending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {remove.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear all (API-040, FR-030 AC3) */}
      <AlertDialog
        open={confirmClear}
        onOpenChange={(o) => !clear.isPending && setConfirmClear(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your whole history?</AlertDialogTitle>
            <AlertDialogDescription>
              All {entries.length}{" "}
              {entries.length === 1 ? "entry disappears" : "entries disappear"}{" "}
              from your phone and this portal. You can&apos;t undo this. Sites
              keep their own record of each outcome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clear.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                clearAll();
              }}
              disabled={clear.isPending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {clear.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {clear.isPending ? "Clearing…" : "Clear history"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}
