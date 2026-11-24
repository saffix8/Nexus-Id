"use client";

// Show-once API key (FR-040 AC1, DESIGN.md §6.1 SCR-020). The key lives only in
// the parent's state; once this unmounts it can't be shown again.

import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ApiKeyReveal({ apiKey, className }: { apiKey: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey);
    } catch {
      toast.error("Couldn't copy. Select the key and copy it manually.");
      return;
    }
    setCopied(true);
    toast.success("Key copied");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-border bg-inset">
        <code
          className="min-w-0 flex-1 select-all break-all px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground"
          aria-label="Your new API key"
        >
          {apiKey}
        </code>
        <Button
          type="button"
          variant="ghost"
          onClick={copy}
          className="h-auto shrink-0 gap-1.5 rounded-none border-l border-border-subtle px-3 focus-visible:ring-inset text-xs text-text-muted hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-success" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        You won&apos;t see this key again. Store it in your server&apos;s secrets, never in a web page.
      </p>
    </div>
  );
}

/** `nxk_ab12` → `nxk_ab12••••••••`. */
export function maskedKey(prefix: string | null | undefined) {
  return prefix ? `${prefix}${"•".repeat(8)}` : "—";
}
