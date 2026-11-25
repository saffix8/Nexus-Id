"use client";

// Incoming verification requests — web stand-in for the mobile ConsentSheet (SCR-008, DESIGN.md §5.2;
// UC-004, MOD-4, MOD-5). Requests reach this account through the extension's device pairing (FR-003).
// On approval this browser builds the SD-JWT presentation + key-binding JWT locally (lib/webHolder.ts)
// with the web keypair; only the requested predicate disclosure leaves the browser.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CircleAlert,
  CircleCheck,
  EyeOff,
  Inbox,
  Loader2,
  TimerOff,
} from "lucide-react";
import { predicateLabel, type SDJWTCredential } from "@nexusid/types";
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
import { EmptyState, ErrorState } from "@/components/nexus";
import {
  NEVER_SHARED,
  PRIVACY_LINE,
  categoryMeta,
  categoryOfPredicate,
  predicateSentence,
} from "@/components/nexus/category";
import { formatExpiry } from "@/components/nexus/format";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { listWebCredentials } from "@/lib/webWallet";
import { getWebSigningKey } from "@/lib/webKeypair";
import { disclosableFields, generateProof } from "@/lib/webHolder";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingRequest {
  requestId: string;
  verifierId: string;
  verifierName: string;
  verifierDomain: string | null;
  requestedFields: string[];
  nonce: string;
  pageUrl: string | null;
  createdAt: string;
  expiresAt: string;
}

interface ServerCredentialStatus {
  issuerCredentialId: string;
  issuerName: string;
  status: "active" | "expired" | "revoked";
}

interface ApiEnvelope {
  success: boolean;
  data?: unknown;
  error?: string;
}

const PENDING_KEY = ["verification-pending"] as const;

// ── Data fetching ─────────────────────────────────────────────────────────────

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, { credentials: "include", ...init });
  const json = (await res
    .json()
    .catch(() => ({ success: false }))) as ApiEnvelope;
  if (!res.ok || !json.success) {
    throw new Error(
      json.error ?? `The NexusID server answered ${res.status}. Try again.`,
    );
  }
  return json.data;
}

const fetchPending = () =>
  api("/api/v1/verification/pending") as Promise<PendingRequest[]>;
const fetchCredentialStatus = () =>
  api("/api/v1/credentials") as Promise<ServerCredentialStatus[]>;

// ── Helpers ───────────────────────────────────────────────────────────────────

interface Candidate {
  credential: SDJWTCredential;
  issuerName: string;
}

/**
 * Credentials in this browser that hold every requested predicate and are not revoked/expired (BR-006).
 * Values are never shown (DESIGN.md §1.2): the screen talks about the condition, not the data.
 */
function findCandidates(
  request: PendingRequest,
  held: SDJWTCredential[],
  statuses: ServerCredentialStatus[],
  now: number,
): Candidate[] {
  const statusById = new Map(statuses.map((s) => [s.issuerCredentialId, s]));
  return held.flatMap((credential) => {
    const server = statusById.get(credential.id);
    if (server && server.status !== "active") return [];
    if (new Date(credential.expires_at).getTime() < now) return [];
    const fields = new Set(disclosableFields(credential));
    if (!request.requestedFields.every((f) => fields.has(f))) return [];
    return [
      {
        credential,
        issuerName:
          server?.issuerName ?? credential.display_name ?? credential.issuer,
      },
    ];
  });
}

function formatClock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Components ────────────────────────────────────────────────────────────────

function Countdown({ seconds }: { seconds: number }) {
  // Announce at 30 s and 10 s only (DESIGN.md §9), not every tick.
  const [announce, setAnnounce] = useState("");
  const said = useRef(new Set<number>());
  useEffect(() => {
    for (const mark of [30, 10]) {
      if (seconds <= mark && seconds > 0 && !said.current.has(mark)) {
        said.current.add(mark);
        setAnnounce(`${mark} seconds left to answer`);
      }
    }
  }, [seconds]);

  const tone =
    seconds <= 10
      ? "text-danger"
      : seconds <= 30
        ? "text-warning"
        : "text-text-muted";
  return (
    <>
      <span
        className={cn("font-mono text-sm tabular-nums", tone)}
        aria-hidden="true"
      >
        {formatClock(seconds)}
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </>
  );
}

function RequestCard({
  request,
  candidates,
  now,
}: {
  request: PendingRequest;
  candidates: Candidate[];
  now: number;
}) {
  const queryClient = useQueryClient();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const predicate = request.requestedFields[0] ?? "";
  const category = categoryOfPredicate(predicate) ?? "identity";
  const meta = categoryMeta(category);
  const candidate = candidates[0];
  const secondsLeft = Math.max(
    0,
    Math.ceil((new Date(request.expiresAt).getTime() - now) / 1000),
  );
  const expired = secondsLeft === 0;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: PENDING_KEY });

  const approve = useMutation({
    mutationFn: async () => {
      if (!candidate)
        throw new Error("No credential in this browser can confirm this.");
      const keypair = await getWebSigningKey();
      if (!keypair)
        throw new Error(
          "This browser has no NexusID signing key. Add a credential here first.",
        );
      const proof = await generateProof({
        credential: candidate.credential,
        requestedFields: request.requestedFields,
        verifierId: request.verifierId,
        nonce: request.nonce,
        signingKey: keypair.privateKey,
      });
      await api("/api/v1/verification/submit-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_requestId: request.requestId,
          proof,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Verified", {
        description: `${request.verifierName} now knows ${predicateSentence(predicate)}. Nothing else was shared.`,
      });
      refresh();
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      api(`/api/v1/verification/reject/${request.requestId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast("Request declined");
      refresh();
    },
  });

  const busy = approve.isPending || reject.isPending;
  const error = (approve.error ?? reject.error) as Error | null;

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-none transition-opacity",
        expired && "opacity-60",
      )}
    >
      {/* Who is asking */}
      <div className="flex items-start gap-3 p-5">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-overlay font-display text-base font-semibold text-foreground"
          aria-hidden="true"
        >
          {request.verifierName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base font-semibold text-foreground">
            {request.verifierName}
          </h2>
          <p className="truncate font-mono text-xs text-text-muted">
            {request.verifierDomain ?? "Unverified domain"}
          </p>
        </div>
        {expired ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
            <TimerOff
              className="size-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            EXPIRED
          </span>
        ) : (
          <Countdown seconds={secondsLeft} />
        )}
      </div>

      <p className="border-t border-border-subtle px-5 py-3 text-sm text-text-muted">
        {request.verifierName} wants to confirm {predicateSentence(predicate)}.
      </p>

      {/* Will be confirmed */}
      <div className="border-t border-border-subtle px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          Will be confirmed
        </p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <CircleCheck
              className="mt-0.5 size-4 shrink-0 text-success"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                {predicateLabel(predicate)}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {predicate} · from {candidate?.issuerName ?? meta.issuerName}
              </p>
            </div>
          </div>
          {candidate && (
            <span className="text-sm font-medium text-success">Yes</span>
          )}
        </div>
      </div>

      {/* Never shared */}
      <div className="border-t border-border-subtle px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          Never shared
        </p>
        <p className="mt-3 flex items-start gap-2.5 text-sm text-text-muted">
          <EyeOff
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {NEVER_SHARED[category].join(" · ")}
        </p>
      </div>

      {/* Using / missing credential */}
      <div className="border-t border-border-subtle px-5 py-3 text-xs text-text-muted">
        {candidate ? (
          <>
            Using: {meta.label} · {candidate.issuerName} · exp{" "}
            {formatExpiry(candidate.credential.expires_at)}
          </>
        ) : (
          // UC-004 3.E1 — the condition cannot be confirmed from held credentials
          <span className="flex items-start gap-2 text-danger">
            <CircleAlert
              className="mt-px size-3.5 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>
              No credential in this browser can confirm this.{" "}
              <Link
                href="/dashboard/credentials"
                className="font-medium text-accent-text hover:underline"
              >
                Add a {meta.label.toLowerCase()} credential
              </Link>{" "}
              or decline.
            </span>
          </span>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mx-5 mb-1 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error.message}
        </p>
      )}

      <div className="flex gap-3 p-5 pt-3">
        {expired ? (
          <Button variant="outline" className="flex-1" onClick={refresh}>
            Close
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => setConfirmDecline(true)}
            >
              {reject.isPending ? "Declining…" : "Decline"}
            </Button>
            <Button
              className="flex-[2]"
              disabled={busy || !candidate}
              onClick={() => approve.mutate()}
            >
              {approve.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {approve.isPending ? "Generating proof…" : "Approve"}
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmDecline} onOpenChange={setConfirmDecline}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Decline request from {request.verifierName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {request.verifierName} will be told you declined. Nothing about
              you is shared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reject.mutate()}>
              Decline request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const now = useNow(1000);
  const pending = useQuery({
    queryKey: PENDING_KEY,
    queryFn: fetchPending,
    refetchInterval: 3000, // no push on web — poll for new requests
  });
  const statuses = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentialStatus,
  });
  // Credentials held (encrypted) in this browser — see lib/webWallet.ts.
  const wallet = useQuery({
    queryKey: ["web-wallet"],
    queryFn: listWebCredentials,
  });
  const held = wallet.data ?? [];

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-text-muted">
        Requests from websites open in your paired browser. Nothing is shared
        until you approve. {PRIVACY_LINE}
      </p>

      {pending.isPending || now === null ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      ) : pending.isError ? (
        <ErrorState
          title="Couldn't load requests"
          message={pending.error.message}
          onRetry={() => pending.refetch()}
          retrying={pending.isFetching}
        />
      ) : pending.data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No pending requests"
          description="When a website asks your paired browser to verify you, the request shows up here within a few seconds."
          action={{ label: "View history", href: "/dashboard/history" }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.data.map((req) => (
            <RequestCard
              key={req.requestId}
              request={req}
              now={now}
              candidates={findCandidates(req, held, statuses.data ?? [], now)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
