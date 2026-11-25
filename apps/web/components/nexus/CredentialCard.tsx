"use client";

// CredentialCard (web) — DESIGN.md §5.1. The identity-document look.
// Client component (key/click handlers) but render is pure: no hooks, no clock. Expiry is formatted from the ISO string directly
// (MM/YYYY) so server and client output match regardless of locale/timezone.
// Never shows raw attribute values — only predicate labels.

import type { CredentialType, PredicateCode } from "@nexusid/types";
import { predicateLabel } from "@nexusid/types";
import { cn } from "@/lib/utils";
import { categoryMeta } from "./category";
import { OutcomeBadge } from "./OutcomeBadge";
import { formatExpiry, truncateId } from "./format";

export type CredentialCardStatus = "valid" | "expired" | "revoked";

interface CredentialCardProps {
  category: CredentialType;
  status: CredentialCardStatus;
  /** Predicate claims the credential can confirm. */
  predicates: (PredicateCode | string)[];
  credentialId: string;
  /** ISO 8601 timestamp. */
  expiresAt: string;
  /** Override the issuer line (defaults to the category's issuer). */
  issuerName?: string;
  onClick?: () => void;
  /** Extra controls (e.g. Delete) rendered in the bottom-right corner. */
  actions?: React.ReactNode;
  className?: string;
}

export function CredentialCard({
  category,
  status,
  predicates,
  credentialId,
  expiresAt,
  issuerName,
  onClick,
  actions,
  className,
}: CredentialCardProps) {
  const meta = categoryMeta(category);
  const { Icon } = meta;
  const revoked = status === "revoked";
  const expired = status === "expired";
  const interactive = Boolean(onClick);

  return (
    <article
      onClick={onClick}
      onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick?.()) : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`${meta.label} credential from ${issuerName ?? meta.issuerName}, ${status}`}
      className={cn(
        "group relative flex aspect-[1.586] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-surface p-4 sm:p-5",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-[border-color,transform] duration-200 ease-out",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        revoked && "opacity-60",
        className,
      )}
      style={{
        backgroundImage: [
          `radial-gradient(120% 90% at 100% 0%, ${meta.color}1F 0%, transparent 55%)`,
          `repeating-linear-gradient(45deg, ${meta.color}0A 0px, ${meta.color}0A 1px, transparent 1px, transparent 9px)`,
        ].join(", "),
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border"
            style={{ background: `${meta.color}1A`, borderColor: `${meta.color}40` }}
            aria-hidden="true"
          >
            <Icon className={cn("size-4", meta.text)} strokeWidth={1.75} />
          </span>
          <p className={cn("truncate text-[11px] font-medium uppercase tracking-[0.08em]", meta.text, revoked && "line-through")}>
            {meta.label}
          </p>
        </div>
        <OutcomeBadge state={status} />
      </header>

      <div className="mt-auto flex items-end justify-between gap-3 pb-3 pt-2">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground sm:text-xl",
              revoked && "line-through",
            )}
          >
            {issuerName ?? meta.issuerName}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">Verifiable credential · SD-JWT</p>
        </div>
        {/* Contact chip — the "this is a document" cue */}
        <span
          className="hidden h-7 w-9 shrink-0 rounded-md border border-white/10 bg-gradient-to-br from-white/[0.10] to-white/[0.02] min-[380px]:block"
          aria-hidden="true"
        >
          <span className="mx-auto mt-[9px] block h-px w-6 bg-white/15" />
          <span className="mx-auto mt-[6px] block h-px w-6 bg-white/15" />
        </span>
      </div>

      <ul className="flex max-h-[52px] flex-wrap gap-1.5 overflow-hidden" aria-label="Confirms">
        {predicates.length ? (
          predicates.map((p) => (
            <li
              key={p}
              className="whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] text-foreground/90"
            >
              {predicateLabel(p)}
            </li>
          ))
        ) : (
          <li className="text-xs text-text-muted">No conditions</li>
        )}
      </ul>

      <footer className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 font-mono text-[11px] text-text-muted">
        <span title={credentialId} className="truncate">
          <span className="mr-1.5 text-text-faint">ID</span>
          {truncateId(credentialId)}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className={cn(expired && "text-danger")}>
            <span className={cn("mr-1.5", expired ? "text-danger/70" : "text-text-faint")}>EXP</span>
            {formatExpiry(expiresAt)}
          </span>
          {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
        </span>
      </footer>
    </article>
  );
}
