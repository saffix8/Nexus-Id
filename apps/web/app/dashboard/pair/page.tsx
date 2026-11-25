"use client";

// Approve a scanned NexusID QR on the web (SRS FR-003 / FR-036, API-025, ALG-006/007).
//
// Web stand-in for the phone. Reached from /pair after a camera opens the QR link:
//   PAIRING  — the extension's code: link that browser to this account.
//   SIGN_IN  — the portal sign-in code (SCR-013): sign that screen in as this user.
// The browser signs the challenge with its device key and calls the same API-025
// (POST /qr-challenges/redeem) the NexusID app uses. The other screen is polling
// API-024 and confirms on its side.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck,
  LogIn,
  MonitorSmartphone,
  QrCode,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { truncateId } from "@/components/nexus";
import {
  PENDING_PAIRING_KEY,
  redeemPairingChallenge,
  parsePairingFragment,
  type QrPurpose,
  type ScannedChallenge,
} from "@/lib/pairing";

type Loaded =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; payload: ScannedChallenge }
  | { kind: "declined"; purpose: QrPurpose };

const COPY: Record<
  QrPurpose,
  {
    title: string;
    question: string;
    caution: string;
    action: string;
    busy: string;
    done: string;
    doneBody: string;
    cancelled: string;
  }
> = {
  PAIRING: {
    title: "Pair a browser",
    question: "Allow this browser to send you verification requests?",
    caution:
      "Only approve if you just scanned the QR code in your own NexusID extension.",
    action: "Pair browser",
    busy: "Pairing…",
    done: "Browser paired",
    doneBody:
      "The extension confirms in a few seconds. Requests from that browser now come to you.",
    cancelled:
      "Nothing was linked. The code expires on its own within 2 minutes.",
  },
  SIGN_IN: {
    title: "Sign in on another screen",
    question: "Sign in to NexusID on the screen showing this code?",
    caution:
      "Only approve if you are in front of that screen. Anyone who sees it signed in can view your history.",
    action: "Sign in",
    busy: "Signing in…",
    done: "Signed in",
    doneBody:
      "The other screen opens your dashboard in a moment. You can close this page.",
    cancelled:
      "Nobody was signed in. The code expires on its own within 2 minutes.",
  },
};

/**
 * Reads the scanned code from the URL fragment, or from storage after login.
 * Idempotent on purpose: React runs effects twice in development, so reading
 * must not consume anything. The fragment is moved into storage and stripped
 * from the address bar; storage is cleared once the user approves or declines.
 */
function readPendingPairing(): ScannedChallenge | null {
  const fragment = window.location.hash.slice(1);
  const fromHash = parsePairingFragment(fragment);

  if (fromHash) {
    try {
      window.sessionStorage.setItem(PENDING_PAIRING_KEY, fragment);
    } catch {
      // Storage unavailable; keep the fragment so a re-run still finds it.
      return fromHash;
    }
    // Drop the one-time code from the address bar and history.
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }

  try {
    const stored = window.sessionStorage.getItem(PENDING_PAIRING_KEY);
    return stored ? parsePairingFragment(stored) : null;
  } catch {
    return null;
  }
}

function clearPendingPairing(): void {
  try {
    window.sessionStorage.removeItem(PENDING_PAIRING_KEY);
  } catch {
    // Nothing stored.
  }
}

function Panel({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof QrCode;
  tone?: "success" | "muted";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-4 p-6 shadow-none">
      <span
        className={
          "flex size-12 items-center justify-center rounded-xl border " +
          (tone === "success"
            ? "border-success/25 bg-success/10 text-success"
            : "border-border bg-overlay text-text-muted")
        }
      >
        <Icon className="size-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h2 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </Card>
  );
}

export default function ApproveQrPage() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    const payload = readPendingPairing();
    setState(payload ? { kind: "ready", payload } : { kind: "missing" });
  }, []);

  const mutation = useMutation({
    mutationFn: redeemPairingChallenge,
    onSuccess: () => {
      clearPendingPairing();
      queryClient.invalidateQueries({ queryKey: ["pairings"] });
    },
  });

  return (
    <div className="mx-auto max-w-md space-y-6">
      {state.kind === "loading" && (
        <Card className="h-48 animate-pulse shadow-none" aria-busy="true" />
      )}

      {state.kind === "missing" && (
        <Panel icon={QrCode} title="No code found">
          <p className="text-sm text-text-muted">
            Scan the QR code again: the one in the NexusID extension to pair a
            browser, or the one on the sign-in page.
          </p>
          <Button asChild variant="secondary">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </Panel>
      )}

      {state.kind === "declined" && (
        <Panel icon={Unlink} tone="muted" title="Cancelled">
          <p className="text-sm text-text-muted">
            {COPY[state.purpose].cancelled}
          </p>
          <Button asChild variant="secondary">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </Panel>
      )}

      {state.kind === "ready" && mutation.isSuccess && (
        <Panel
          icon={CircleCheck}
          tone="success"
          title={COPY[state.payload.purpose].done}
        >
          <p className="text-sm text-text-muted">
            {COPY[state.payload.purpose].doneBody}
          </p>
          <Button asChild variant="secondary">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </Panel>
      )}

      {state.kind === "ready" &&
        !mutation.isSuccess &&
        (() => {
          const copy = COPY[state.payload.purpose];
          return (
            <Panel
              icon={
                state.payload.purpose === "SIGN_IN" ? LogIn : MonitorSmartphone
              }
              title={copy.title}
            >
              <div className="space-y-1.5">
                <p className="text-sm text-foreground">{copy.question}</p>
                <p className="text-sm text-text-muted">{copy.caution}</p>
              </div>
              <p className="font-mono text-xs text-text-muted">
                Code · {truncateId(state.payload.challengeId, 8, 4)}
              </p>
              {mutation.isError && (
                <p role="alert" className="text-sm text-danger">
                  {(mutation.error as Error).message}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <Button
                  className="flex-1"
                  onClick={() => mutation.mutate(state.payload)}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? copy.busy : copy.action}
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={mutation.isPending}
                  onClick={() => {
                    clearPendingPairing();
                    setState({
                      kind: "declined",
                      purpose: state.payload.purpose,
                    });
                  }}
                >
                  Not me
                </Button>
              </div>
            </Panel>
          );
        })()}
    </div>
  );
}
