// apps/web/components/VerifierIntegrationCode.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface VerifierIntegrationCodeProps {
  verifierId: string;
  verifierName: string;
  fields: string[];
  callbackUrl?: string;
}

export function VerifierIntegrationCode({ verifierId, verifierName, fields, callbackUrl }: VerifierIntegrationCodeProps) {
  const [copied, setCopied] = useState(false);

  const nonce = 'GENERATED_SERVER_SIDE_PER_REQUEST';
  const snippet = `<div id="nexusid-verify"
     data-verifier-id="${verifierId}"
     data-verifier-name="${verifierName}"
     data-fields="${fields.join(',')}"
     data-nonce="${nonce}"${callbackUrl ? `\n     data-callback-url="${callbackUrl}"` : ''}>
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
