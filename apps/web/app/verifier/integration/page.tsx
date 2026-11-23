"use client";

// Integration guide for Service Providers: the page snippet, the in-page
// result event (SRS FR-017 / FR-028), and server-side confirmation.

import Link from "next/link";
import { VerifierIntegrationCode } from "@/components/VerifierIntegrationCode";
import { useVerifierProfile } from "@/lib/verifierApi";

const EVENT_SNIPPET = `document.addEventListener('nexusid:result', (e) => {
  // e.detail.status: 'completed' | 'rejected' | 'expired' | 'error'
  // e.detail.requestId: send this to your server to confirm (step 3)
  // e.detail.verifiedFields: only the fields you asked for (on 'completed')
  console.log('NexusID:', e.detail);
});`;

const SERVER_SNIPPET = `GET /api/v1/verification/request/{requestId}
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
  const { data: profile } = useVerifierProfile();

  return (
    <div className="max-w-3xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#EEF0F6]">
          1. Add the verification element
        </h2>
        <p className="text-xs text-[#8B92A8]">
          Place this where users should verify. The NexusID browser extension
          detects it, creates the request with your key and a fresh single-use
          nonce, and routes it to the user&apos;s paired device. Get your key
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
          verifierId={profile?.domain ?? "yourcompany.com"}
          verifierName={profile?.displayName ?? "Your Company"}
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
