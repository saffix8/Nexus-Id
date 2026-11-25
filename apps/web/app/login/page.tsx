// SCR-012 — Role selection (FR-035): each role leads to its own sign-in and dashboard.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, WalletCards, type LucideIcon } from "lucide-react";
import { AuthFrame } from "@/components/nexus/AuthFrame";

export const metadata: Metadata = { title: "Sign in" };

const ROLES: { href: string; icon: LucideIcon; title: string; body: string; cta: string }[] = [
  {
    href: "/auth/login",
    icon: WalletCards,
    title: "I have credentials",
    body: "Open your wallet: credentials, paired browsers and what you've shared.",
    cta: "End User sign-in",
  },
  {
    href: "/auth/provider-login",
    icon: Building2,
    title: "I verify users",
    body: "Service Provider portal: conditions, API keys and your live verification log.",
    cta: "Service Provider sign-in",
  },
];

export default function RoleSelectionPage() {
  return (
    <AuthFrame size="lg" title="How are you using NexusID?" description="Choose one. You can switch later.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {ROLES.map(({ href, icon: Icon, title, body, cta }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong sm:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-overlay text-foreground">
              <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="space-y-1.5">
              <span className="block font-display text-lg font-semibold text-foreground">{title}</span>
              <span className="block text-sm leading-relaxed text-text-muted">{body}</span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-accent-text">
              {cta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </AuthFrame>
  );
}
