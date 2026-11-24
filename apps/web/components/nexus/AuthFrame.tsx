// AuthFrame — shadcn login-03 layout: wordmark above a centred card. Used by SCR-012 and SCR-017.

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LogoMark } from "./AppShell";

interface AuthFrameProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Card width; role selection is wider. */
  size?: "sm" | "lg";
}

export function AuthFrame({ title, description, children, footer, size = "sm" }: AuthFrameProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className={cn("flex w-full flex-col gap-6", size === "sm" ? "max-w-sm" : "max-w-3xl")}>
        <Link href="/" className="flex items-center gap-2 self-center font-display text-lg font-semibold text-foreground">
          <LogoMark className="size-7 text-sm" />
          NexusID
        </Link>
        <Card className="p-6 shadow-none md:p-8">
          <div className="mb-6 space-y-1.5 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
            {description && <p className="text-sm text-text-muted">{description}</p>}
          </div>
          {children}
        </Card>
        {footer && <div className="text-center text-sm text-text-muted">{footer}</div>}
      </div>
    </div>
  );
}

/** Inline field: label + input slot + error text, wired for aria. */
export function AuthField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
