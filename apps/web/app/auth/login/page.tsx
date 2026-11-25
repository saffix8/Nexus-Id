"use client";

// SCR-013 — End User sign-in with the phone (FR-036), WhatsApp Web style:
// QRPanel on the left, three steps on the right.
//
//   1. POST /api/auth?action=qr-start   → API-023 { purpose: SIGN_IN }; the poll token
//                                          stays in an httpOnly cookie (never in page JS).
//   2. Phone scans + signs               → API-025 (ALG-006 + ALG-007)
//   3. POST /api/auth?action=qr-status  → API-024 every 2 s; on approval the route sets
//                                          the session cookie and we open the dashboard.
//
// The code lives 120 s (BR-002, BR-022). When it runs out a fresh one is fetched
// automatically; after MAX_AUTO_REFRESH codes in a row (10 minutes untouched) the
// page stops and shows "New code" so an idle tab doesn't mint codes forever.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  KeyRound,
  ScanLine,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LogoMark } from "@/components/nexus/AppShell";
import { QRPanel, type QRScanStatus } from "@/components/nexus/QRPanel";
import { ErrorState } from "@/components/nexus/ErrorState";

const TTL_SECONDS = 120;
const POLL_MS = 2_000;
const MAX_AUTO_REFRESH = 5;
const MAX_POLL_FAILURES = 3;

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Smartphone,
    title: "Open NexusID on your phone",
    body: "Sign in to the app first if you haven't yet.",
  },
  {
    icon: ScanLine,
    title: "Tap Scan",
    body: "The round button in the middle of the tab bar.",
  },
  {
    icon: ShieldCheck,
    title: "Point your phone at this code",
    body: "Confirm with your fingerprint. This page opens your dashboard.",
  },
];

interface Challenge {
  challengeId: string;
  qrPayload: string;
}

type Envelope<T> = { success: boolean; data?: T; error?: string };

/** Only same-portal paths are allowed as a post-login destination. */
function safeNext(next: string | string[] | undefined): string | null {
  return typeof next === "string" &&
    next.startsWith("/dashboard") &&
    !next.startsWith("//")
    ? next
    : null;
}

export default function QrSignInPage({
  searchParams,
}: {
  searchParams: { next?: string | string[] };
}) {
  const next = safeNext(searchParams.next);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<QRScanStatus>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const autoRefreshes = useRef(0);
  const starting = useRef(false);

  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    setChallenge(null);
    setExpired(false);
    setError(null);
    setStatus("waiting");
    try {
      const res = await fetch("/api/auth?action=qr-start", { method: "POST" });
      const json = (await res.json()) as Envelope<Challenge>;
      if (!res.ok || !json.success || !json.data)
        throw new Error(json.error ?? "Couldn't create a sign-in code");
      setChallenge(json.data);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to reach NexusID. Check your connection and try again."
          : (err as Error).message,
      );
    } finally {
      starting.current = false;
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const handleExpire = useCallback(() => {
    if (autoRefreshes.current < MAX_AUTO_REFRESH) {
      autoRefreshes.current += 1;
      void start();
    } else {
      setExpired(true); // QRPanel shows "Code expired · New code"
    }
  }, [start]);

  const manualRefresh = useCallback(() => {
    autoRefreshes.current = 0;
    void start();
  }, [start]);

  // API-024 poll while the code is live.
  useEffect(() => {
    if (!challenge || expired || status === "paired") return;
    let cancelled = false;
    let failures = 0;

    const tick = async () => {
      try {
        const res = await fetch("/api/auth?action=qr-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId: challenge.challengeId }),
        });
        const json = (await res.json()) as Envelope<{
          state: string;
          signedIn: boolean;
        }>;
        if (cancelled) return;
        if (res.status === 409) {
          // Another tab started a newer code and now owns the poll cookie.
          setError(
            "Sign-in was started in another tab. Use that tab, or get a new code here.",
          );
          return;
        }
        if (!res.ok || !json.success) throw new Error(json.error);
        failures = 0;
        if (json.data?.signedIn) {
          setStatus("paired");
          // Full navigation so the server layout reads the new session cookie.
          setTimeout(() => window.location.assign(next ?? "/dashboard"), 700);
        }
      } catch {
        failures += 1;
        if (!cancelled && failures >= MAX_POLL_FAILURES) {
          setError(
            "Lost the connection to NexusID while waiting for your phone.",
          );
        }
      }
    };

    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [challenge, expired, status, next]);

  const passwordHref = `/auth/login/password${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-lg font-semibold text-foreground"
        >
          <LogoMark className="size-7 text-sm" />
          NexusID
        </Link>
        <Link
          href="/auth/provider-login"
          className="text-sm text-text-muted hover:text-foreground"
        >
          Service Provider?{" "}
          <span className="text-accent-text">Sign in here</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4 md:px-8">
        <Card className="grid w-full max-w-[960px] overflow-hidden shadow-none md:grid-cols-[auto_1fr]">
          {/* Left: the code */}
          <div className="flex items-center justify-center border-b border-border-subtle bg-inset p-6 md:border-b-0 md:border-r md:p-10">
            {error ? (
              <ErrorState
                bare
                title="Couldn't show a sign-in code"
                message={error}
                onRetry={manualRefresh}
                className="w-[264px]"
              />
            ) : (
              <QRPanel
                value={challenge?.qrPayload ?? null}
                ttlSeconds={TTL_SECONDS}
                status={status}
                onExpire={handleExpire}
                onRefresh={manualRefresh}
                showSteps={false}
                doneLabel="Signed in"
                qrLabel="NexusID sign-in QR code"
                className="border-0 bg-transparent p-0"
              />
            )}
          </div>

          {/* Right: what to do */}
          <div className="flex flex-col gap-8 p-6 md:p-10">
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
                Sign in with your phone
              </h1>
              <p className="text-sm leading-relaxed text-text-muted">
                No password. Your phone signs this one-time code with the key
                that never leaves it.
              </p>
            </div>

            <ol className="space-y-5">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-overlay font-mono text-sm text-foreground">
                    {i + 1}
                  </span>
                  <span className="space-y-0.5 pt-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {title}
                      <Icon
                        className="size-4 text-text-muted"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="block text-sm text-text-muted">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="text-xs text-text-faint">
              The code changes every 2 minutes and works once. NexusID never
              shows it to anyone else.
            </p>

            <Separator />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="secondary" className="gap-2">
                <Link href={passwordHref}>
                  <KeyRound
                    className="size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Use email and password
                </Link>
              </Button>
              <Link
                href={passwordHref}
                className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-foreground"
              >
                Lost your phone? Sign in with your password
                <ArrowRight
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </div>

            <p className="text-sm text-text-muted">
              New to NexusID?{" "}
              <Link
                href="/auth/register"
                className="font-medium text-accent-text hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
