// PageHeader — one consistent page heading: title, one-line description, actions on the right.
// Stacks on phones, sits in a row from `sm` up.

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
