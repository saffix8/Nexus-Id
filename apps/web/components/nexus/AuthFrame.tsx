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
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-16 items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-base font-semibold text-foreground">
          <LogoMark className="size-7 text-sm" />
          NexusID
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-4 sm:px-6 sm:pb-24">
        <div className={cn("flex w-full flex-col gap-6", size === "sm" ? "max-w-[400px]" : "max-w-3xl")}>
          {size === "lg" ? (
            <div>
              <div className="mb-8 space-y-2 text-center">
                <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-3xl">
                  {title}
                </h1>
                {description && <p className="text-sm text-text-muted sm:text-[15px]">{description}</p>}
              </div>
              {children}
            </div>
          ) : (
            <Card className="border-0 bg-transparent p-0 shadow-none sm:border sm:bg-card sm:p-8 sm:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="mb-7 space-y-1.5 sm:text-center">
                <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
                {description && <p className="text-sm leading-relaxed text-text-muted">{description}</p>}
              </div>
              {children}
            </Card>
          )}
          {footer && <div className="text-sm text-text-muted sm:text-center">{footer}</div>}
        </div>
      </main>
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
