"use client";

// PredicateChip — DESIGN.md §5.6. Category-tinted pill, human label, code in tooltip.

import { PREDICATE_DISPLAY, isPredicateCode, type PredicateCode } from "@nexusid/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { categoryMeta } from "./category";

interface PredicateChipProps {
  code: PredicateCode | string;
  className?: string;
}

export function PredicateChip({ code, className }: PredicateChipProps) {
  if (!isPredicateCode(code)) {
    // Outside the catalog (BR-021) — show the raw code, neutral, so it's visible but not dressed up.
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-border bg-overlay px-2.5 py-0.5 font-mono text-xs text-text-muted",
          className,
        )}
      >
        {code}
      </span>
    );
  }

  const { label, category } = PREDICATE_DISPLAY[code];
  const { Icon, tint } = categoryMeta(category);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex cursor-default items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            tint,
            className,
          )}
        >
          <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {label}
          <span className="sr-only"> ({code})</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-xs">{code}</TooltipContent>
    </Tooltip>
  );
}
