// apps/web/components/VerifierIntegrationCode.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface VerifierIntegrationCodeProps {
  /** Service Provider API key (SRS FR-034) — the backend identifies the verifier from it. */
  apiKey: string;
  verifierId: string;
  verifierName: string;
  fields: string[];
  callbackUrl?: string;
}

export function VerifierIntegrationCode({ apiKey, verifierId, verifierName, fields, callbackUrl }: VerifierIntegrationCodeProps) {
  const [copied, setCopied] = useState(false);

  // No data-nonce: the extension generates a fresh single-use nonce per request.
  const snippet = `<div id="nexusid-verify"
     data-api-key="${apiKey}"
     data-verifier-id="${verifierId}"
     data-verifier-name="${verifierName}"
     data-fields="${fields.join(',')}"${callbackUrl ? `\n     data-callback-url="${callbackUrl}"` : ''}>
</div>`;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border-default bg-bg-inset overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span className="text-xs font-mono text-text-tertiary uppercase tracking-wide">HTML</span>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <pre className="p-4 text-sm font-mono text-text-primary overflow-x-auto whitespace-pre">
        {snippet}
      </pre>
    </div>
  );
}
