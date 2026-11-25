"use client";

// LiveLogTable shell — DESIGN.md §5.5 (SP dashboard SCR-018).
// Time (relative, absolute in tooltip) · Session (mono, copy on click) · Condition · Outcome · Proof hash.
// The caller polls (every 2 s) and passes rows; rows not seen before slide in and flash.
// Hydration: relative/absolute times are only computed on the client (useNow / tooltip content).

import { useEffect, useRef, useState } from "react";
import { formatDistanceStrict, format } from "date-fns";
import { Activity, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { VerificationOutcome } from "@nexusid/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { OutcomeBadge, outcomeStateFromVerification } from "./OutcomeBadge";
import { PredicateChip } from "./PredicateChip";
import { truncateId } from "./format";

export interface LiveLogRow {
  id: string;
  /** ISO 8601 */
  createdAt: string;
  sessionId: string;
  predicate: string;
  outcome: VerificationOutcome;
  proofHash?: string | null;
}

interface LiveLogTableProps {
  rows?: LiveLogRow[];
  loading?: boolean;
  /** API `error` message. */
  error?: string | null;
  onRetry?: () => void;
  title?: string;
  /** Shows the "Live" indicator. */
  live?: boolean;
  className?: string;
}

/** Rows newer than our clock tick (or slightly ahead of it: server skew) read "just now", never "in 2 seconds". */
function relativeTime(iso: string, now: number) {
  const t = new Date(iso).getTime();
  return now - t < 10_000 ? "just now" : formatDistanceStrict(t, now, { addSuffix: true });
}

const PRIVACY_NOTE = "NexusID never sends personal data to Service Providers. Only the outcome.";

export function LiveLogTable({
  rows,
  loading,
  error,
  onRetry,
  title = "Verification log",
  live,
  className,
}: LiveLogTableProps) {
  const now = useNow(10_000);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!rows) return;
    if (seen.current === null) {
      seen.current = new Set(rows.map((r) => r.id)); // first load: no flash
      return;
    }
    const added = rows.filter((r) => !seen.current!.has(r.id)).map((r) => r.id);
    added.forEach((id) => seen.current!.add(id));
    setFresh(new Set(added));
  }, [rows]);

  async function copySession(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Session ID copied");
    } catch {
      toast.error("Couldn't copy the session ID");
    }
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle px-4 sm:px-5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={PRIVACY_NOTE}
                className="rounded text-text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Info className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{PRIVACY_NOTE}</TooltipContent>
          </Tooltip>
        </div>
        {live && !error && (
          <span className="inline-flex items-center gap-2 text-xs text-text-muted">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Live
          </span>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
          <p className="text-sm text-danger">{error}</p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} className="gap-1.5">
              <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Retry
            </Button>
          )}
        </div>
      ) : !loading && rows && rows.length === 0 ? (
        <EmptyState
          bare
          icon={Activity}
          title="No verifications yet"
          description="Verification sessions from your site will appear here within seconds of the user approving."
        />
      ) : (
        <>
        {/* Phones: one stacked row per session */}
        <ul className="divide-y divide-border-subtle md:hidden">
          {loading && !rows
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="space-y-2 px-4 py-3.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </li>
              ))
            : rows?.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "flex items-start justify-between gap-3 px-4 py-3.5",
                    fresh.has(row.id) &&
                      "motion-safe:animate-[rowIn_200ms_ease-out,rowFlash_1.5s_ease-out] motion-reduce:animate-row-flash",
                  )}
                >
                  <div className="min-w-0 space-y-2">
                    <PredicateChip code={row.predicate} />
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                      <span className="num">{now === null ? "…" : relativeTime(row.createdAt, now)}</span>
                      <span aria-hidden="true" className="text-text-faint">·</span>
                      <button
                        type="button"
                        onClick={() => copySession(row.sessionId)}
                        aria-label={`Copy session ID ${row.sessionId}`}
                        className="rounded font-mono text-text-muted hover:text-foreground"
                      >
                        {truncateId(row.sessionId, 8, 4)}
                      </button>
                    </p>
                  </div>
                  <OutcomeBadge state={outcomeStateFromVerification(row.outcome)} variant="dot" className="shrink-0" />
                </li>
              ))}
        </ul>
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Time</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="hidden pr-5 lg:table-cell">Proof hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-5"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                    <TableCell className="hidden pr-5 lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              : rows?.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      fresh.has(row.id) &&
                        "motion-safe:animate-[rowIn_200ms_ease-out,rowFlash_1.5s_ease-out] motion-reduce:animate-row-flash",
                    )}
                  >
                    <TableCell className="num whitespace-nowrap pl-5 text-text-muted">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="cursor-default">
                            {now === null ? "…" : relativeTime(row.createdAt, now)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="font-mono text-xs">
                          {format(new Date(row.createdAt), "d MMM yyyy, HH:mm:ss")}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => copySession(row.sessionId)}
                        title={`${row.sessionId} — click to copy`}
                        aria-label={`Copy session ID ${row.sessionId}`}
                        className="rounded font-mono text-xs text-foreground hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {truncateId(row.sessionId, 10, 4)}
                      </button>
                    </TableCell>
                    <TableCell>
                      <PredicateChip code={row.predicate} />
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge state={outcomeStateFromVerification(row.outcome)} variant="dot" />
                    </TableCell>
                    <TableCell className="hidden pr-5 font-mono text-xs text-text-muted lg:table-cell">
                      {row.proofHash ? row.proofHash.slice(0, 10) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        </>
      )}
    </Card>
  );
}
