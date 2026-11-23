"use client";

// Integration guide for Service Providers (SRS FR-043, FR-032, FR-045):
// open a session server-side (API-030), embed the session in the page, react
// to the in-page result event, and confirm the outcome server-side (API-031).

import Link from "next/link";
import { VerifierIntegrationCode } from "@/components/VerifierIntegrationCode";

const EVENT_SNIPPET = `document.addEventListener('nexusid:result', (e) => {
  // e.detail.status: 'completed' | 'rejected' | 'expired' | 'error'
  // e.detail.requestId: the session ID — confirm it on your server (step 3)
  // e.detail.verifiedFields: only the fields you asked for (on 'completed')
  console.log('NexusID:', e.detail);
});`;

const SERVER_SNIPPET = `GET /api/v1/verification/sessions/{sessionId}/outcome
x-api-key: YOUR_API_KEY

→ { "status": "completed", "verifiedFields": { "degree_title": "..." } }
→ { "status": "rejected" }   // user declined
→ { "status": "expired" }    // no answer within the validity window`;

function Code({ children }: { children: string }) {
  return (
    <pre
      className="rounded-lg border border-[#252C3D] bg-[#0A0C10] p-4 text-xs text-[#EEF0F6] overflow-x-auto"
      style={{ fontFamily: "JetBrains Mono, monospace" }}
    >
      {children}
    </pre>
  );
}

export default function IntegrationPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#EEF0F6]">
          1. Open a session on your server, embed it in the page
        </h2>
        <p className="text-xs text-[#8B92A8]">
          For each page view, your server opens a session with your API key.
          NexusID returns a session ID and a single-use nonce, valid for 120
          seconds. Put only those two in the page. The NexusID browser
          extension detects them and relays the request to the user&apos;s
          paired device; your key never reaches the browser. Get your key
          from{" "}
          <Link
            href="/verifier/api-keys"
            className="text-[#3B6FE8] hover:text-[#4A7EF7]"
          >
            API Keys
          </Link>
          .
        </p>
        <VerifierIntegrationCode
          apiKey="YOUR_API_KEY"
          fields={["degree_title", "university"]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#EEF0F6]">
          2. React to the outcome on the page
        </h2>
        <p className="text-xs text-[#8B92A8]">
          The extension fires a{" "}
          <code className="text-[#EEF0F6]">nexusid:result</code> event on the
          element — including when the user declines or the request times out.
        </p>
        <Code>{EVENT_SNIPPET}</Code>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#EEF0F6]">
          3. Confirm on your server
        </h2>
        <p className="text-xs text-[#8B92A8]">
          Page events can be forged by the page&apos;s visitor, so confirm the
          result from your backend with your API key before granting access.
          Only your key can read your requests.
        </p>
        <Code>{SERVER_SNIPPET}</Code>
      </section>
    </div>
  );
}
