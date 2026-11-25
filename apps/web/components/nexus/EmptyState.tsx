// EmptyState on shadcn Card — DESIGN.md §7: 64 px icon tile + title + one sentence + one action.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmptyAction = { label: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyAction;
  /** Render without the Card border (e.g. inside a table). */
  bare?: boolean;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, bare, className }: EmptyStateProps) {
  const body = (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center sm:py-14">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-overlay text-text-muted shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h3 className="mb-1 font-display text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mb-5 max-w-xs text-sm leading-relaxed text-text-muted">{description}</p>
      {action &&
        (action.href ? (
          <Button asChild variant="secondary">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );

  if (bare) return <div className={className}>{body}</div>;
  return <Card className={className}>{body}</Card>;
}
