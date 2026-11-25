"use client";

// CodeBlock — DESIGN.md §5.6. Inset bg, 1px border, mono 13px, label + Copy (Copy → Check for 2 s, toast "Copied").

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  /** Top-bar label: a language ("bash") or a short caption ("Server — open a session"). */
  label?: string;
  /** Toast text on copy. */
  copiedMessage?: string;
  className?: string;
}

export function CodeBlock({ code, label = "code", copiedMessage = "Copied", className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually");
      return;
    }
    setCopied(true);
    toast.success(copiedMessage);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-inset", className)}>
      <div className="flex h-9 items-center justify-between gap-3 border-b border-border-subtle pl-4 pr-1.5">
        <span className="min-w-0 truncate font-mono text-[11px] text-text-muted">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy ${label}`}
          className="h-7 gap-1.5 px-2 text-xs text-text-muted hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-success" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-foreground sm:text-[13px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
