"use client";

// SCR-020 — API keys (FR-040, BR-009, ALG-009; DESIGN.md §6.1).
// API-043 gives key data only (prefix, rotation time). API-044 generates/rotates
// and returns the plaintext key once; it is held only in this page's state while
// the dialog is open, and stored server-side only as a SHA-256 hash.

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { KeyRound, Loader2, RotateCw, ShieldCheck } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/nexus/PageHeader";
import {
  ApiKeyReveal,
  CodeBlock,
  EmptyState,
  ErrorState,
  maskedKey,
} from "@/components/nexus";
import { useApiKeyInfo, useRegenerateApiKey } from "@/lib/verifierApi";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function formatDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "d MMM yyyy, HH:mm") : "—";
}

export default function ApiKeysPage() {
  const info = useApiKeyInfo();
  const regenerate = useRegenerateApiKey();
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** The plaintext key — shown once, dropped when the dialog closes. */
  const [revealed, setRevealed] = useState<string | null>(null);

  const hasKey = Boolean(info.data?.apiKeyPrefix);

  function issue(kind: "generate" | "rotate") {
    regenerate.mutate(undefined, {
      onSuccess: (issued) => {
        setConfirmOpen(false);
        setRevealed(issued.apiKey);
        toast.success(
          kind === "rotate"
            ? "Key rotated. The old key no longer works."
            : "Key created",
        );
      },
      onError: (err) => {
        setConfirmOpen(false);
        toast.error(err.message);
      },
    });
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="API keys"
        description="Your server uses this key to open verification sessions and read outcomes. Keep it on the server, never in a web page or app."
      />

      {info.isError ? (
        <ErrorState
          title="Couldn't load your key"
          message={info.error.message}
          onRetry={() => info.refetch()}
          retrying={info.isFetching}
        />
      ) : !info.isPending && !hasKey ? (
        <EmptyState
          icon={KeyRound}
          title="No API key yet"
          description="Create a key to start opening verification sessions from your server."
          action={{
            label: regenerate.isPending ? "Creating…" : "Create key",
            onClick: () => issue("generate"),
          }}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle px-4 sm:px-5">
            <h3 className="font-display text-base font-semibold text-foreground">
              Secret key
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={info.isPending || regenerate.isPending}
              className="gap-1.5"
            >
              <RotateCw
                className="size-3.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Rotate key
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 sm:pl-5">Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="pr-4 text-right sm:pr-5 sm:text-left">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {info.isPending ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="pl-5">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell className="pr-5">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="whitespace-nowrap pl-4 font-medium text-foreground sm:pl-5">
                    Live key
                  </TableCell>
                  <TableCell>
                    <code
                      className="font-mono text-xs text-foreground"
                      aria-label={`Key starting ${info.data?.apiKeyPrefix}, rest hidden`}
                    >
                      {maskedKey(info.data?.apiKeyPrefix)}
                    </code>
                  </TableCell>
                  <TableCell className="num hidden whitespace-nowrap text-text-muted sm:table-cell">
                    {formatDate(info.data?.apiKeyRotatedAt)}
                  </TableCell>
                  <TableCell className="pr-4 text-right sm:pr-5 sm:text-left">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      <ShieldCheck
                        className="size-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      ACTIVE
                    </span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="border-t border-border-subtle px-4 py-3 text-xs text-text-muted sm:px-5">
            NexusID stores only a hash of this key, so it can&apos;t be shown
            again. Lost it? Rotate to get a new one.
          </p>
        </Card>
      )}

      <Card className="space-y-3 p-4 sm:p-5">
        <h3 className="font-display text-base font-semibold text-foreground">
          Using the key
        </h3>
        <p className="text-sm text-text-muted">
          Send it in the{" "}
          <code className="font-mono text-xs text-foreground">x-api-key</code>{" "}
          header from your server.
        </p>
        <CodeBlock
          label="bash"
          code={`curl -X POST ${API_BASE}/verification/sessions \\\n  -H "x-api-key: $NEXUSID_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"predicate":"AGE_OVER_18"}'`}
          copiedMessage="Command copied"
        />
      </Card>

      {/* Rotate confirmation (BR-009) */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => !regenerate.isPending && setConfirmOpen(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate key?</AlertDialogTitle>
            <AlertDialogDescription>
              The current key ({maskedKey(info.data?.apiKeyPrefix)}) stops
              working immediately. Any server still using it will get errors
              until you deploy the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerate.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open until the request finishes
                issue("rotate");
              }}
              disabled={regenerate.isPending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {regenerate.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {regenerate.isPending ? "Rotating…" : "Rotate key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Show-once dialog (FR-040 AC1) */}
      <Dialog
        open={revealed !== null}
        onOpenChange={(o) => !o && setRevealed(null)}
      >
        <DialogContent
          className="sm:max-w-xl"
          onInteractOutside={(e) => e.preventDefault()} // don't lose the key to a stray click
        >
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now and store it with your server&apos;s secrets.
            </DialogDescription>
          </DialogHeader>
          {revealed && <ApiKeyReveal apiKey={revealed} />}
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>
              I&apos;ve stored the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
