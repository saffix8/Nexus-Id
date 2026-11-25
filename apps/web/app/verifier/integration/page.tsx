"use client";

// Integration guide (FR-042 AC3, FR-043, FR-032, FR-045): open a session on the
// server (API-030), put the tag on the page, read the outcome on the server (API-031).

import Link from "next/link";
import { isPredicateCode } from "@nexusid/types";
import { CodeBlock, PageHeader, PredicateChip } from "@/components/nexus";
import { PAGE_SNIPPET, outcomeSnippet, sessionSnippet } from "@/components/VerifierIntegrationCode";
import { useRequirements } from "@/lib/verifierApi";

const EVENT_SNIPPET = `// Optional: react in the page as soon as the extension sees the result.
// Always confirm on your server (step 3) before unlocking anything.
document.addEventListener("nexusid:result", (e) => {
  console.log("NexusID session", e.detail.requestId, e.detail.status);
});`;

function Step({ n, title, last, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-4 sm:gap-x-5">
      {!last && <span className="absolute bottom-0 left-[13.5px] top-9 w-px bg-border" aria-hidden="true" />}
      <span className="num relative z-10 flex size-7 items-center justify-center rounded-full border border-border-strong bg-background font-mono text-xs text-foreground">
        {n}
      </span>
      <div className={last ? "min-w-0 space-y-3" : "min-w-0 space-y-3 pb-10"}>
        <h2 className="pt-0.5 font-display text-base font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </li>
  );
}

export default function IntegrationPage() {
  const { data } = useRequirements();
  const configured = (data?.predicates ?? []).filter(isPredicateCode);
  const predicate = configured[0] ?? "AGE_OVER_18";

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="Integration"
        description="Three steps. Your server never receives personal data, only whether the condition was met."
      />
      <ol>

      <Step n={1} title="Open a session on your server">
        <p className="text-sm text-text-muted">
          One session per check, for one condition you&apos;ve configured
          {configured.length > 0 ? (
            <>
              {" "}(<span className="inline-flex flex-wrap gap-1.5 align-middle">{configured.map((c) => <PredicateChip key={c} code={c} />)}</span>)
            </>
          ) : (
            <> on the <Link href="/verifier/requirements" className="text-accent-text hover:underline">Requirements</Link> page</>
          )}
          . Your API key is on the <Link href="/verifier/api-keys" className="text-accent-text hover:underline">API keys</Link> page.
        </p>
        <CodeBlock label="Node.js" code={sessionSnippet(predicate)} copiedMessage="Code copied" />
      </Step>

      <Step n={2} title="Put the session on your page">
        <p className="text-sm text-text-muted">The extension detects the tag and asks the user&apos;s phone. The nonce is single use.</p>
        <CodeBlock label="HTML" code={PAGE_SNIPPET} copiedMessage="Code copied" />
        <CodeBlock label="JavaScript (optional)" code={EVENT_SNIPPET} copiedMessage="Code copied" />
      </Step>

      <Step n={3} title="Read the outcome on your server" last>
        <p className="text-sm text-text-muted">Poll every 2 s until it isn&apos;t PENDING. Sessions expire after 120 s.</p>
        <CodeBlock label="Node.js" code={outcomeSnippet()} copiedMessage="Code copied" />
      </Step>
      </ol>
    </div>
  );
}
