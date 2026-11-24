// ErrorState — DESIGN.md §7: the API's own message + Retry. Never "Something went wrong" alone.

import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Render without the Card border. */
  bare?: boolean;
  className?: string;
}

export function ErrorState({ title = "Couldn't load this", message, onRetry, retrying, bare, className }: ErrorStateProps) {
  const body = (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-8 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-danger/25 bg-danger/10 text-danger">
        <CircleAlert className="size-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="max-w-sm text-sm text-text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying} className="gap-1.5">
          <RefreshCw className={cn("size-3.5", retrying && "animate-spin")} strokeWidth={1.75} aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
  if (bare) return <div className={className}>{body}</div>;
  return <Card className={cn("shadow-none", className)}>{body}</Card>;
}
