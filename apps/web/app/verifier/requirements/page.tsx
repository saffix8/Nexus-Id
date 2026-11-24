"use client";

// SCR-019 — Verification requirements (FR-041, FR-005, BR-021; DESIGN.md §6.1).
// The 9 catalog predicates grouped by category, colour strip per category.
// Saved with API-046; only catalog codes can be chosen.

import { useEffect, useMemo, useState } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_DISPLAY,
  PREDICATE_CODES,
  PREDICATE_DISPLAY,
  isPredicateCode,
  type CredentialType,
  type PredicateCode,
} from "@nexusid/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, PredicateChip, categoryMeta } from "@/components/nexus";
import { cn } from "@/lib/utils";
import { useRequirements, useSaveRequirements } from "@/lib/verifierApi";

const CATEGORY_ORDER: CredentialType[] = [
  "identity",
  "education",
  "enrollment",
  "employment",
];

/** Strip colour per category — full class strings for Tailwind's scanner. */
const STRIP: Record<CredentialType, string> = {
  identity: "bg-cat-identity",
  education: "bg-cat-education",
  employment: "bg-cat-employment",
  enrollment: "bg-cat-enrollment",
};

const BY_CATEGORY = CATEGORY_ORDER.map((category) => ({
  category,
  codes: PREDICATE_CODES.filter(
    (c) => PREDICATE_DISPLAY[c].category === category,
  ),
})).filter((g) => g.codes.length > 0);

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export default function RequirementsPage() {
  const query = useRequirements();
  const save = useSaveRequirements();

  const saved = useMemo(
    () => (query.data?.predicates ?? []).filter(isPredicateCode),
    [query.data],
  );
  const [selected, setSelected] = useState<PredicateCode[] | null>(null);

  // Take the server state on first load and after each save.
  useEffect(() => {
    if (query.data) setSelected(saved);
  }, [query.data, saved]);

  const current = selected ?? saved;
  const dirty = selected !== null && !sameSet(current, saved);
  // Keep catalog order in the preview and the payload.
  const ordered = PREDICATE_CODES.filter((c) => current.includes(c));

  function toggle(code: PredicateCode, on: boolean) {
    setSelected((prev) => {
      const base = prev ?? saved;
      return on
        ? [...new Set([...base, code])]
        : base.filter((c) => c !== code);
    });
  }

  function onSave() {
    save.mutate(ordered, {
      onSuccess: () => toast.success("Requirements saved"),
      onError: (err) => toast.error(err.message),
    });
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load your requirements"
        message={query.error.message}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const loading = query.isPending;

  return (
    <div className="space-y-6 pb-4">
      <div className="max-w-2xl space-y-1">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
          What do you need to confirm?
        </h2>
        <p className="text-sm text-text-muted">
          Pick the conditions your site may ask about. Users confirm a
          condition, never share the data behind it. A session for a condition
          that isn&apos;t picked here is refused.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {BY_CATEGORY.map(({ category, codes }) => {
          const { Icon, text } = categoryMeta(category);
          const meta = CATEGORY_DISPLAY[category];
          const count = codes.filter((c) => current.includes(c)).length;
          return (
            <Card
              key={category}
              className="relative overflow-hidden shadow-none"
            >
              <span
                className={cn("absolute inset-y-0 left-0 w-1", STRIP[category])}
                aria-hidden="true"
              />
              <fieldset
                className="p-5 pl-6"
                disabled={loading || save.isPending}
              >
                <legend className="sr-only">{meta.label}</legend>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg bg-overlay",
                        text,
                      )}
                    >
                      <Icon
                        className="size-5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <p
                        className={cn(
                          "text-[11px] font-medium uppercase tracking-[0.08em]",
                          text,
                        )}
                      >
                        {meta.label}
                      </p>
                      <p className="text-sm text-text-muted">
                        Issued by {meta.issuerName}
                      </p>
                    </div>
                  </div>
                  {!loading && count > 0 && (
                    <span className="rounded-full border border-border bg-overlay px-2 py-0.5 text-xs text-text-muted tabular-nums">
                      {count} of {codes.length}
                    </span>
                  )}
                </div>

                <ul className="space-y-1">
                  {codes.map((code) => {
                    const id = `req-${code}`;
                    const checked = current.includes(code);
                    return (
                      <li key={code}>
                        {loading ? (
                          <div className="flex items-center gap-3 px-2 py-2">
                            <Skeleton className="size-4 rounded-sm" />
                            <Skeleton className="h-4 w-36" />
                          </div>
                        ) : (
                          <label
                            htmlFor={id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-overlay",
                              checked && "bg-overlay/60",
                            )}
                          >
                            <Checkbox
                              id={id}
                              checked={checked}
                              onCheckedChange={(v) => toggle(code, v === true)}
                            />
                            <span className="flex-1 text-sm text-foreground">
                              {PREDICATE_DISPLAY[code].label}
                            </span>
                            <code className="font-mono text-[11px] text-text-muted">
                              {code}
                            </code>
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            </Card>
          );
        })}
      </div>

      {/* Sticky footer: live preview + save */}
      <div className="sticky bottom-4 z-10">
        <Card className="flex flex-col gap-4 border-border bg-surface/95 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Users will be asked to confirm
            </p>
            {loading ? (
              <Skeleton className="h-6 w-56 rounded-full" />
            ) : ordered.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <ListChecks
                  className="size-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Nothing selected. Every session will be refused.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" aria-live="polite">
                {ordered.map((c) => (
                  <PredicateChip key={c} code={c} />
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => setSelected(saved)}
                disabled={save.isPending}
              >
                Discard
              </Button>
            )}
            <Button
              onClick={onSave}
              disabled={loading || !dirty || save.isPending}
              className="min-w-40"
            >
              {save.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {save.isPending
                ? "Saving…"
                : dirty
                  ? "Save requirements"
                  : "Saved"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
