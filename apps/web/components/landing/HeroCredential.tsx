"use client";

// Landing hero visual (DESIGN.md §6.1): a credential card whose raw values blur away into ✓ predicates.
// Deterministic first render (the "raw" view) so SSR and hydration match; the loop starts in an effect.
// Reduced motion → opacity only, no blur or movement (§3.5).

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck, EyeOff, IdCard } from "lucide-react";
import { predicateLabel } from "@nexusid/types";

type Row = { field: string; raw: string; proof: string | null };

// Sample holder (fictional). Rows with `proof` become a confirmed predicate; the rest are never shared.
const ROWS: Row[] = [
  {
    field: "Date of birth",
    raw: "15 Jan 2000",
    proof: predicateLabel("AGE_OVER_18"),
  },
  {
    field: "Nationality",
    raw: "Pakistani",
    proof: predicateLabel("NATIONALITY_PAKISTANI"),
  },
  { field: "Full name", raw: "Ayesha Khan", proof: null },
  { field: "CNIC", raw: "35202-1234567-1", proof: null },
];

const HOLD_MS = 3200;

export function HeroCredential() {
  const reduce = useReducedMotion();
  const [proved, setProved] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setProved((p) => !p), HOLD_MS);
    return () => window.clearInterval(id);
  }, []);

  const out = reduce
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(8px)", y: -4 };
  const into = reduce
    ? { opacity: 1 }
    : { opacity: 1, filter: "blur(0px)", y: 0 };
  const from = reduce
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(8px)", y: 4 };

  return (
    <figure className="relative mx-auto w-full max-w-[440px]">
      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 pl-7"
        style={{
          backgroundImage:
            "radial-gradient(circle at 100% 0%, rgba(59,130,246,0.08), transparent 55%), repeating-linear-gradient(45deg, rgba(59,130,246,0.04) 0 1px, transparent 1px 10px)",
        }}
      >
        <span
          className="absolute inset-y-0 left-0 w-1 bg-cat-identity"
          aria-hidden="true"
        />

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-cat-identity">
              National identity
            </p>
            <p className="mt-1 font-display text-base font-semibold text-foreground">
              NADRA Pakistan
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-lg bg-cat-identity/15 text-cat-identity">
            <IdCard className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        </div>

        <dl className="mt-6 divide-y divide-border-subtle">
          {ROWS.map((row) => (
            <div
              key={row.field}
              className="flex h-11 items-center justify-between gap-4"
            >
              <dt className="text-sm text-text-muted">{row.field}</dt>
              <dd className="relative flex h-full min-w-0 items-center justify-end">
                <AnimatePresence mode="wait" initial={false}>
                  {!proved ? (
                    <motion.span
                      key="raw"
                      initial={from}
                      animate={into}
                      exit={out}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="truncate font-mono text-[13px] text-foreground"
                    >
                      {row.raw}
                    </motion.span>
                  ) : row.proof ? (
                    <motion.span
                      key="proof"
                      initial={from}
                      animate={into}
                      exit={out}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
                    >
                      <CircleCheck
                        className="size-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      {row.proof}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="hidden"
                      initial={from}
                      animate={into}
                      exit={out}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="inline-flex items-center gap-1.5 text-xs text-text-muted"
                    >
                      <EyeOff
                        className="size-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Never shared
                    </motion.span>
                  )}
                </AnimatePresence>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <figcaption
        className="mt-4 flex items-center justify-center gap-2 text-sm text-text-muted"
        aria-live="off"
      >
        <span
          className={`size-1.5 rounded-full transition-colors duration-300 ${proved ? "bg-success" : "bg-text-faint"}`}
          aria-hidden="true"
        />
        {proved
          ? "What the website gets with NexusID"
          : "What a website sees when you upload your CNIC"}
      </figcaption>
    </figure>
  );
}
