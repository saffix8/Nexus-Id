// apps/web/components/VerifierIntegrationCode.tsx
"use client";

// SRS verification flow from the Service Provider's side:
//   1. Server opens a session with the API key (API-030, FR-043).
//   2. Page carries only the session ID and single-use nonce, which the
//      NexusID extension relays with its pairing token (API-032, FR-032).
// The API key stays on the provider's server; it never goes in a page.

import { useState } from "react";
import { Button } from "@/components/ui/Button";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface VerifierIntegrationCodeProps {
  /** Service Provider API key (FR-034) — used server-side only. */
  apiKey: string;
  fields: string[];
  callbackUrl?: string;
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border-default bg-bg-inset overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span className="text-xs font-mono text-text-tertiary uppercase tracking-wide">
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <pre className="p-4 text-sm font-mono text-text-primary overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

export function VerifierIntegrationCode({
  apiKey,
  fields,
  callbackUrl,
}: VerifierIntegrationCodeProps) {
  const body = JSON.stringify(
    callbackUrl
      ? { requestedFields: fields, callbackUrl }
      : { requestedFields: fields },
  );

  const serverCode = `// On your server, for each page view (API-030). Never in the browser.
const res = await fetch("${API_BASE}/verification/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": "${apiKey}" },
  body: JSON.stringify(${body}),
});
const { data } = await res.json(); // { sessionId, nonce, expiresAt } — valid 120 s`;

  const pageCode = `<div id="nexusid-verify"
     data-session-id="{{ data.sessionId }}"
     data-nonce="{{ data.nonce }}">
</div>`;

  return (
    <div className="space-y-3">
      <CodeBlock label="Server — open a session" code={serverCode} />
      <CodeBlock label="Page — HTML" code={pageCode} />
    </div>
  );
}
