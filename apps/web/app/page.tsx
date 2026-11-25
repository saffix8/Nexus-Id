// Landing page — DESIGN.md §6.1 (Stripe / Linear / Resend style): nav · hero with the animated credential ·
// old way vs NexusID · 3 steps · 4 issuers · code block for verifiers · footer.
// Server component; only the hero visual and the CodeBlock are client components.

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  CircleCheck,
  EyeOff,
  Fingerprint,
  Globe,
  ShieldCheck,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import {
  PREDICATE_DISPLAY,
  type CredentialType,
  type PredicateCode,
} from "@nexusid/types";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/nexus/CodeBlock";
import { LogoMark } from "@/components/nexus/AppShell";
import { CATEGORY_ORDER, categoryMeta, predicatesFor } from "@/components/nexus/category";
import { HeroCredential } from "@/components/landing/HeroCredential";

export const metadata: Metadata = {
  title: { absolute: "NexusID · Prove what matters. Hide what doesn't." },
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const VERIFIER_SNIPPET = `// 1. Your server opens a session for one condition
const { data } = await fetch("${API_BASE}/verification/sessions", {
  method: "POST",
  headers: { "x-api-key": process.env.NEXUSID_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ predicate: "AGE_OVER_18" }),
}).then((r) => r.json());

// 2. Your page carries the session; the NexusID extension does the rest
//    <div id="nexusid-verify" data-session-id="…" data-nonce="…"></div>

// 3. Read the answer. Only the outcome, never the user's data
const outcome = await fetch(\`${API_BASE}/verification/sessions/\${data.sessionId}/outcome\`, {
  headers: { "x-api-key": process.env.NEXUSID_API_KEY },
}).then((r) => r.json());
// outcome.data.outcome === "VERIFIED"`;

const OLD_WAY = [
  "Full name",
  "Father's name",
  "Date of birth",
  "CNIC number",
  "Home address",
  "Photo",
];

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: WalletCards,
    title: "Add a credential",
    body: "NADRA, HEC, your university or employer signs a credential straight into the wallet on your phone.",
  },
  {
    icon: Globe,
    title: "A website asks one question",
    body: "“Is this person over 18?” The NexusID browser extension picks up the request and sends it to your phone.",
  },
  {
    icon: Fingerprint,
    title: "Approve with your fingerprint",
    body: "Your phone builds the proof on the device. The website gets a signed yes, and nothing else.",
  },
];


function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {body && (
        <p className="mt-4 text-[15px] leading-relaxed text-text-muted sm:text-base">{body}</p>
      )}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-background/85 backdrop-blur-md">
        <nav
          className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-4 sm:px-6"
          aria-label="Main"
        >
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg"
            aria-label="NexusID home"
          >
            <LogoMark />
            <span className="font-display text-base font-semibold text-foreground">
              NexusID
            </span>
          </Link>
          <div className="hidden items-center gap-6 text-sm text-text-muted md:flex">
            <a
              href="#how"
              className="transition-colors duration-150 hover:text-foreground"
            >
              How it works
            </a>
            <a
              href="#issuers"
              className="transition-colors duration-150 hover:text-foreground"
            >
              Issuers
            </a>
            <a
              href="#verifiers"
              className="transition-colors duration-150 hover:text-foreground"
            >
              For verifiers
            </a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-text-muted hover:text-foreground"
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/provider-register">
                <span className="sm:hidden">Verify users</span>
                <span className="hidden sm:inline">Start verifying</span>
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-16 pt-14 sm:px-6 md:gap-16 md:pb-24 md:pt-24 lg:grid-cols-[1.3fr_1fr] lg:pt-28">
          <div>
            <p className="flex items-center gap-2 font-mono text-xs text-text-muted">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              Selective disclosure · SD-JWT · RFC 9901
            </p>
            <h1 className="mt-5 font-display text-[40px] font-bold leading-[1.04] tracking-[-0.035em] text-foreground [text-wrap:wrap] sm:text-5xl lg:text-[56px] xl:text-[64px]">
              Prove what matters.
              <br />
              <span className="text-text-muted">Hide what doesn&apos;t.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
              NexusID lets you prove you are over 18, hold a degree or study at
              a university, without handing a website your CNIC. Websites get a
              signed answer. Your data stays on your phone.
            </p>
            <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
              <Button asChild size="lg">
                <Link href="/auth/login">
                  Open your wallet
                  <ArrowRight
                    className="size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#verifiers">I verify users</a>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-border-subtle pt-6">
              {[
                ["0", "documents uploaded"],
                ["1", "answer per request"],
                ["120 s", "proof window"],
              ].map(([k, v]) => (
                <div key={v}>
                  <dt className="sr-only">{v}</dt>
                  <dd className="num font-display text-xl font-semibold text-foreground">{k}</dd>
                  <dd className="mt-0.5 text-xs leading-snug text-text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroCredential />
        </section>

        {/* ── Old way vs NexusID ────────────────────────────────────────── */}
        <section
          className="border-t border-border-subtle"
          aria-labelledby="compare-title"
        >
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-24">
            <div id="compare-title">
              <SectionHeading
                eyebrow="Why it matters"
                title="A shop needs one answer. Today it gets your whole card."
                body="To check your age, websites ask for a photo of your CNIC and keep it. NexusID replaces the upload with a proof of the one condition they need."
              />
            </div>
            <div className="mt-10 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-2">
              <article className="rounded-xl border border-border bg-surface p-5 sm:p-6">
                <div className="flex items-center gap-2 text-text-muted">
                  <Ban
                    className="size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <Eyebrow>The old way · Upload your CNIC</Eyebrow>
                </div>
                <ul className="mt-6 space-y-3">
                  {OLD_WAY.map((item) => (
                    <li
                      key={item}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-foreground">{item}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-danger">
                        <span className="size-1 rounded-full bg-danger" aria-hidden="true" />
                        Shared and stored
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-border-subtle pt-4 text-sm text-text-muted">
                  The shop keeps a copy of everything, and every leak exposes
                  all of it.
                </p>
              </article>

              <article className="rounded-xl border border-success/25 bg-surface p-5 sm:p-6">
                <div className="flex items-center gap-2 text-success">
                  <ShieldCheck
                    className="size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em]">
                    NexusID · Answer one question
                  </p>
                </div>
                <div className="mt-6 rounded-lg border border-border-subtle bg-inset p-4">
                  <p className="text-sm text-text-muted">
                    Shop A wants to confirm
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Age over 18
                      </p>
                      <p className="font-mono text-xs text-text-muted">
                        AGE_OVER_18
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                      <CircleCheck
                        className="size-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Yes
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-2 text-sm text-text-muted">
                  <EyeOff
                    className="mt-0.5 size-4 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>
                    Never shared: name, date of birth, CNIC, address, photo.
                  </span>
                </div>
                <p className="mt-6 border-t border-border-subtle pt-4 text-sm text-text-muted">
                  The proof is signed by NADRA and bound to your phone. It
                  can&apos;t be reused or forged.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section
          id="how"
          className="scroll-mt-16 border-t border-border-subtle"
        >
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-24">
            <SectionHeading
              eyebrow="How it works"
              title="Three steps, a few seconds"
            />
            <ol className="mt-10 grid grid-cols-1 gap-0 md:mt-14 md:grid-cols-3 md:gap-10">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 pb-10 last:pb-0 md:block md:pb-0"
                >
                  {/* connector: vertical on phones, horizontal from md */}
                  {i < STEPS.length - 1 && (
                    <>
                      <span className="absolute bottom-0 left-[17.5px] top-10 w-px bg-border md:hidden" aria-hidden="true" />
                      <span className="absolute left-12 right-[-28px] top-[18px] hidden h-px bg-border md:block" aria-hidden="true" />
                    </>
                  )}
                  <span className="relative z-10 flex size-9 items-center justify-center rounded-full border border-border-strong bg-background text-foreground">
                    <step.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="md:mt-6">
                    <p className="num font-mono text-xs text-text-muted">Step {i + 1}</p>
                    <h3 className="mt-1.5 font-display text-lg font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Issuers ───────────────────────────────────────────────────── */}
        <section
          id="issuers"
          className="scroll-mt-16 border-t border-border-subtle"
        >
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-24">
            <SectionHeading
              eyebrow="Issuers"
              title="Credentials from the sources that already know you"
              body="Each issuer signs its credential with its own key. Websites check that signature, not a copy of your documents."
            />
            <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 md:mt-12 lg:grid-cols-4">
              {CATEGORY_ORDER.map((category) => {
                const meta = categoryMeta(category);
                return (
                  <article key={category} className="flex flex-col bg-surface p-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex size-9 items-center justify-center rounded-lg border ${meta.tint}`}
                      >
                        <meta.Icon className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <span className="font-mono text-[11px] text-text-faint">
                        {predicatesFor(category).length} condition{predicatesFor(category).length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <h3 className="mt-6 font-display text-base font-semibold text-foreground">
                      {meta.issuerName}
                    </h3>
                    <p className={`mt-0.5 text-xs ${meta.text}`}>{meta.label}</p>
                    <ul className="mt-5 space-y-2 border-t border-border-subtle pt-4">
                      {predicatesFor(category).map((code) => (
                        <li
                          key={code}
                          className="flex items-center gap-2 text-sm text-text-muted"
                        >
                          <CircleCheck
                            className="size-3.5 shrink-0 text-text-faint"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          {PREDICATE_DISPLAY[code].label}
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Verifiers ─────────────────────────────────────────────────── */}
        <section
          id="verifiers"
          className="scroll-mt-16 border-t border-border-subtle"
        >
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1fr_1.3fr] lg:gap-12">
            <div>
              <SectionHeading
                eyebrow="For verifiers"
                title="Integrate in two minutes"
                body="Open a session on your server, put two attributes on your page, read the outcome. You never receive or store personal data, so there is nothing to leak."
              />
              <ul className="mt-8 space-y-3 text-sm text-text-muted">
                {[
                  "Nine ready-made conditions: age, nationality, degree, CGPA, enrolment, employment",
                  "Single-use nonce, 120 s window, replayed proofs rejected",
                  "Live log of every verification: outcome and condition only",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <CircleCheck
                      className="mt-0.5 size-4 shrink-0 text-success"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/auth/provider-register">
                    Create a provider account
                    <ArrowRight
                      className="size-4"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  className="text-text-muted hover:text-foreground"
                >
                  <Link href="/auth/provider-login">Sign in</Link>
                </Button>
              </div>
            </div>
            <CodeBlock
              code={VERIFIER_SNIPPET}
              label="server.ts"
              copiedMessage="Snippet copied"
            />
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-10 text-sm text-text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-6 text-xs" />
            <span className="font-medium text-foreground">NexusID</span>
            <span className="text-text-faint">·</span>
            <span>Only the answer is shared.</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/auth/login" className="hover:text-foreground">Wallet sign-in</Link>
            <Link href="/auth/provider-login" className="hover:text-foreground">Provider sign-in</Link>
            <span>Air University Islamabad · FYP 2026</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
