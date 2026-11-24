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
        "relative flex aspect-[1.586] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 pl-6",
        "transition-colors duration-150",
        interactive &&
          "cursor-pointer hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        revoked && "opacity-60",
        className,
      )}
      style={{
        backgroundImage: [
          `radial-gradient(circle at 100% 0%, ${meta.color}14 0%, transparent 55%)`,
          `repeating-linear-gradient(45deg, ${meta.color}0A 0px, ${meta.color}0A 1px, transparent 1px, transparent 10px)`,
        ].join(", "),
      }}
    >
      {/* Category strip */}
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} aria-hidden="true" />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", meta.text, revoked && "line-through")}>
            {meta.label}
          </p>
          <p className={cn("truncate text-sm font-medium text-foreground", revoked && "line-through")}>
            {issuerName ?? meta.issuerName}
          </p>
        </div>
        <OutcomeBadge state={status} />
      </header>

      <div className="flex flex-1 items-center">
        <span
          className="flex size-14 items-center justify-center rounded-xl"
          style={{ background: `${meta.color}26` }}
          aria-hidden="true"
        >
          <Icon className={cn("size-10", meta.text)} strokeWidth={1.75} />
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">Confirms</p>
        <p className="line-clamp-2 text-sm text-foreground">
          {predicates.length ? predicates.map(predicateLabel).join(" · ") : "—"}
        </p>
      </div>

      <footer className="mt-3 flex items-center justify-between gap-3 font-mono text-xs text-text-muted">
        <span title={credentialId}>
          <span className="mr-1.5">ID</span>
          {truncateId(credentialId)}
        </span>
        <span className="flex items-center gap-3">
          <span className={cn(expired && "text-danger")}>
            <span className="mr-1.5">EXPIRES</span>
            {formatExpiry(expiresAt)}
          </span>
          {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
        </span>
      </footer>
    </article>
  );
}
