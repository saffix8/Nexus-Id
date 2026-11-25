"use client";

// Paired browsers & devices (FR-038): this account's phone key + each paired browser with Revoke
// (API-026 / API-027). Used on SCR-014 (dashboard) and the Devices page.

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Loader2, Monitor, Smartphone, Unlink } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe, usePairings, useRevokePairing, type Pairing } from "@/lib/userApi";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { OutcomeBadge } from "./OutcomeBadge";
import { truncateId } from "./format";
import { relativeTime as relative } from "./time";

function browserName(p: Pairing) {
  return p.browser ?? "Browser extension";
}


export function PairedDevices({ now, showPairLink = true }: { now: number | null; showPairLink?: boolean }) {
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
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-4 sm:p-5">
        <div className="min-w-0 space-y-1">
          <h3 className="font-display text-base font-semibold text-foreground">
            Paired browsers & devices
          </h3>
          <p className="text-sm text-text-muted">
            Browsers whose NexusID extension can send requests to your phone.
          </p>
        </div>
        {showPairLink && (
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link href="/dashboard/devices">Pair a browser</Link>
          </Button>
        )}
      </div>

      {/* Your phone — the device key every proof is signed with */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
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
                className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
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
                    <span className="font-mono text-text-muted">
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
        <div className="mt-auto border-t border-border-subtle px-4 py-3 sm:px-5">
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
              {revoke.isPending ? "Revoking…" : "Revoke browser"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

