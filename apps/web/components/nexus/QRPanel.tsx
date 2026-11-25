"use client";

// QRPanel — DESIGN.md §5.4 (extension SCR-011, portal SCR-013).
// White QR in a white rounded square, 120 s countdown ring (BR-002), expired state with blur + "New code".
//
// Hydration: the first render always shows the full TTL (or `startRemaining`); the clock only
// starts inside useEffect, so server and client markup match.

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type QRScanStatus = "waiting" | "scanned" | "paired";

interface QRPanelProps {
  /** QR payload. `null` → loading skeleton. */
  value: string | null;
  ttlSeconds?: number;
  /** Seconds left when the panel mounts (default = ttl). Use when the challenge was issued earlier. */
  startRemaining?: number;
  status?: QRScanStatus;
  /** Shown in the expired overlay as "New code". */
  onRefresh?: () => void;
  onExpire?: () => void;
  /** "side" for the portal, "below" for the extension popup. */
  layout?: "side" | "below";
  /** Hide the built-in numbered steps (the page renders its own). */
  showSteps?: boolean;
  /** Status text once redeemed: "Paired" (default) or "Signed in". */
  doneLabel?: string;
  /** Accessible name of the QR image. */
  qrLabel?: string;
  className?: string;
}

const SIZE = 200; // QR square
const RING = SIZE + 32;
const STROKE = 4;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const STEPS = ["Open NexusID on your phone", "Tap Scan", "Point at this code"];

function formatClock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function QRPanel({
  value,
  ttlSeconds = 120,
  startRemaining,
  status = "waiting",
  onRefresh,
  onExpire,
  layout = "side",
  showSteps = true,
  doneLabel = "Paired",
  qrLabel = "Pairing QR code",
  className,
}: QRPanelProps) {
  const initial = Math.max(0, Math.min(ttlSeconds, startRemaining ?? ttlSeconds));
  const [remaining, setRemaining] = useState(initial);
  const [announce, setAnnounce] = useState("");
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // New code → reset the deadline. Status changes (waiting → scanned) must not restart it.
  const deadline = useRef<number | null>(null);
  useEffect(() => {
    setRemaining(initial);
    setAnnounce("");
    deadline.current = value === null || initial === 0 ? null : performance.now() + initial * 1000;
  }, [value, initial]);

  useEffect(() => {
    if (status === "paired") return;
    const id = setInterval(() => {
      if (deadline.current === null) return;
      const left = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setRemaining(left);
      if (left === 30 || left === 10) setAnnounce(`${left} seconds left to scan`);
      if (left === 0) {
        deadline.current = null;
        setAnnounce("Code expired");
        onExpireRef.current?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [status]);

  const expired = value !== null && remaining === 0 && status !== "paired";
  const ringTone =
    status === "paired" ? "text-success" : remaining <= 10 ? "text-danger" : remaining <= 30 ? "text-warning" : "text-primary";
  const progress = status === "paired" ? 1 : remaining / ttlSeconds;

  const statusLine = expired ? (
    <StatusLine dot="bg-danger" text="Code expired" />
  ) : status === "paired" ? (
    <StatusLine dot="bg-success" text={doneLabel} icon />
  ) : status === "scanned" ? (
    <StatusLine dot="bg-accent-text" text="Scanned, confirming…" pulse />
  ) : (
    <StatusLine dot="bg-accent-text" text="Waiting for scan…" pulse />
  );

  return (
    <Card
      className={cn(
        "flex gap-8 p-5 shadow-none",
        layout === "side" ? "flex-col items-center sm:flex-row sm:items-center" : "flex-col items-center",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative" style={{ width: RING, height: RING }}>
          {/* Countdown ring */}
          <svg
            width={RING}
            height={RING}
            viewBox={`0 0 ${RING} ${RING}`}
            className={cn("absolute inset-0 -rotate-90 transition-colors duration-150", ringTone)}
            aria-hidden="true"
          >
            <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="hsl(var(--border))" strokeWidth={STROKE} />
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress)}
              className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300 motion-safe:ease-linear"
            />
          </svg>

          {/* QR — white on white for scan contrast */}
          <div
            className="absolute left-4 top-4 overflow-hidden rounded-xl bg-white p-3"
            style={{ width: SIZE, height: SIZE }}
          >
            {value === null ? (
              <div className="size-full animate-pulse rounded-md bg-neutral-200" aria-label="Generating code" />
            ) : (
              <QRCodeSVG
                value={value}
                size={SIZE - 24}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#0C0E13"
                className={cn("transition-[filter] duration-200", expired && "blur-md")}
                role="img"
                aria-label={qrLabel}
              />
            )}
            {expired && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70">
                <span className="text-sm font-medium text-neutral-900">Code expired</span>
                {onRefresh && (
                  <Button size="sm" onClick={onRefresh} className="gap-1.5">
                    <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    New code
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {statusLine}
          {value !== null && status !== "paired" && !expired && (
            <span className={cn("font-mono text-xs tabular-nums", ringTone)}>{formatClock(remaining)}</span>
          )}
        </div>
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
      </div>

      {showSteps && (
      <ol className={cn("space-y-3", layout === "below" && "w-full")}>
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-3 text-sm text-text-muted">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-overlay font-mono text-xs text-foreground">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      )}
    </Card>
  );
}

function StatusLine({ dot, text, pulse, icon }: { dot: string; text: string; pulse?: boolean; icon?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-text-muted">
      <span className="relative flex size-2" aria-hidden="true">
        {pulse && <span className={cn("absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping", dot)} />}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      <span className={icon ? "inline-flex items-center gap-1 text-success" : undefined}>
        {text}
        {icon && <Check className="size-3.5" strokeWidth={1.75} aria-hidden="true" />}
      </span>
    </span>
  );
}
