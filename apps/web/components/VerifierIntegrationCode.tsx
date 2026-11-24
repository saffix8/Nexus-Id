// apps/web/components/VerifierIntegrationCode.tsx
"use client";

// The Service Provider integration (FR-042 AC3, FR-043, FR-032, FR-045):
//   1. Server opens a session for one catalog predicate with the API key (API-030).
//   2. The page carries only the session ID and single-use nonce; the NexusID
//      extension detects it and relays it with its pairing token (API-032).
//   3. Server reads the outcome with the API key (API-031). Outcome only, no data.
// The API key stays on the provider's server; it never goes in a page.

import { CodeBlock } from "@/components/nexus/CodeBlock";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export type SnippetStep = "session" | "page" | "outcome";

interface VerifierIntegrationCodeProps {
  /** A configured catalog predicate code, e.g. AGE_OVER_18. */
  predicate: string;
  /** Placeholder or env var shown where the key goes (never a real key). */
  apiKeyRef?: string;
  steps?: SnippetStep[];
  className?: string;
}

export function sessionSnippet(predicate: string, apiKeyRef = "process.env.NEXUSID_API_KEY") {
  return `// Server, once per checkout (API-030). Never in the browser.
const res = await fetch("${API_BASE}/verification/sessions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": ${apiKeyRef},
  },
  body: JSON.stringify({ predicate: "${predicate}" }),
});
const { data } = await res.json(); // { sessionId, nonce, expiresAt } — valid 120 s`;
}

export const PAGE_SNIPPET = `<!-- Page: the NexusID extension picks this up (FR-032) -->
<div id="nexusid-verify"
     data-session-id="{{ sessionId }}"
     data-nonce="{{ nonce }}"></div>`;

export function outcomeSnippet(apiKeyRef = "process.env.NEXUSID_API_KEY") {
  return `// Server: read the outcome (API-031). Only the answer, never user data.
const r = await fetch(\`${API_BASE}/verification/sessions/\${sessionId}/outcome\`, {
  headers: { "x-api-key": ${apiKeyRef} },
});
const { data } = await r.json();
// data.outcome: "PENDING" | "VERIFIED" | "FAILED" | "DECLINED" | "EXPIRED"
if (data.outcome === "VERIFIED") unlockCheckout();`;
}

export function VerifierIntegrationCode({
  predicate,
  apiKeyRef,
  steps = ["session", "page", "outcome"],
  className,
}: VerifierIntegrationCodeProps) {
  return (
    <div className={className ?? "space-y-3"}>
      {steps.includes("session") && (
        <CodeBlock label="1 · Server — open a session" code={sessionSnippet(predicate, apiKeyRef)} copiedMessage="Code copied" />
      )}
      {steps.includes("page") && <CodeBlock label="2 · Page — HTML" code={PAGE_SNIPPET} copiedMessage="Code copied" />}
      {steps.includes("outcome") && (
        <CodeBlock label="3 · Server — read the outcome" code={outcomeSnippet(apiKeyRef)} copiedMessage="Code copied" />
      )}
    </div>
  );
}
