'use client';

import { useCallback, useEffect, useState } from 'react';

interface VerifierKey {
  domain: string;
  displayName: string;
  apiKey: string;
  trusted: boolean;
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const DEFAULT_DOMAIN = 'demo-jobportal.nexusid.com';

function getToken(): string | null {
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('nexusid_token='))
    ?.split('=')[1] ?? null;
}

function maskKey(key: string): string {
  if (key.length <= 12) return '••••••••••••';
  return `${key.slice(0, 8)}${'•'.repeat(20)}${key.slice(-4)}`;
}

export default function ApiKeysPage() {
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [verifier, setVerifier] = useState<VerifierKey | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadKey = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const response = await fetch(`${API}/verifiers/api-key?domain=${encodeURIComponent(domain)}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Unable to load API key');
      setVerifier(json.data);
    } catch (err) {
      setVerifier(null);
      setError(err instanceof Error ? err.message : 'Unable to load API key');
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => { void loadKey(); }, [loadKey]);

  async function copyKey() {
    if (!verifier) return;
    await navigator.clipboard.writeText(verifier.apiKey);
    setCopied(true);
    setNotice('API key copied to clipboard');
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function regenerateKey() {
    if (!verifier || !window.confirm('Regenerate this API key? Existing integrations will stop working immediately.')) return;
    setRotating(true);
    setError(null);
    setNotice(null);
    try {
      const token = getToken();
      const response = await fetch(`${API}/verifiers/api-key/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ domain }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Unable to regenerate API key');
      setVerifier(json.data);
      setRevealed(true);
      setNotice('API key regenerated. Update every integration using the old key.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to regenerate API key');
    } finally {
      setRotating(false);
    }

  }

  async function createVerifier() {
    setCreating(true);
    setError(null);
    try {
      const token = getToken();
      const response = await fetch(`${API}/verifiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ domain, displayName: domain }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Unable to create verifier');
      setVerifier(json.data);
      setRevealed(true);
      setNotice('Verifier created. Store this API key securely.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create verifier');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[#3B6FE8]">Access control</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#EEF0F6]">API keys</h2>
        <p className="mt-2 text-sm text-[#8B92A8]">
          Use this key when your website requests NexusID analytics. Keep it private like a password.
        </p>
      </div>

      <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6 space-y-5">
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-wider text-[#525A72]">Verifier domain</span>
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            onBlur={() => void loadKey()}
            className="mt-2 w-full bg-[#0A0C10] border border-[#252C3D] rounded-md px-3 py-2.5 text-sm text-[#EEF0F6] outline-none focus:border-[#3B6FE8]"
            placeholder="your-company.com"
          />
        </label>

        {loading && <div className="h-16 rounded-md bg-[#0A0C10] animate-pulse" />}
        {error && (
          <div className="rounded-md border border-[#4A1515] bg-[#250F0F] px-4 py-3 text-sm text-[#EF4444]">
            {error}
          </div>
        )}
        {!loading && error?.startsWith('No verifier is configured') && (
          <div className="flex items-center justify-between rounded-md border border-[#252C3D] bg-[#0A0C10] p-4">
            <div>
              <p className="text-sm font-medium text-[#EEF0F6]">Set up this verifier</p>
              <p className="mt-1 text-xs text-[#8B92A8]">Create an owned verifier record for this domain.</p>
            </div>
            <button
              onClick={() => void createVerifier()}
              disabled={creating}
              className="rounded-md bg-[#3B6FE8] px-3 py-2 text-xs font-medium text-white hover:bg-[#4A7EF7] disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create verifier'}
            </button>
          </div>
        )}
        {notice && (
          <div className="rounded-md border border-[#16532F] bg-[#0F2A1A] px-4 py-3 text-sm text-[#22C55E]">
            {notice}
          </div>
        )}

        {!loading && verifier && (
          <>
            <div className="flex items-center justify-between border-b border-[#1E2330] pb-4">
              <div>
                <p className="text-sm font-medium text-[#EEF0F6]">{verifier.displayName}</p>
                <p className="mt-1 text-xs font-mono text-[#525A72]">{verifier.domain}</p>
              </div>
              <span className="rounded-full bg-[#0F2A1A] px-2.5 py-1 text-xs text-[#22C55E]">
                {verifier.trusted ? 'Trusted' : 'Active'}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-[#525A72]">Secret API key</span>
                <button onClick={() => setRevealed((value) => !value)} className="text-xs text-[#3B6FE8] hover:text-[#4A7EF7]">
                  {revealed ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-[#252C3D] bg-[#0A0C10] px-3 py-2.5 text-xs text-[#8B92A8]">
                  {revealed ? verifier.apiKey : maskKey(verifier.apiKey)}
                </code>
                <button onClick={() => void copyKey()} className="rounded-md border border-[#252C3D] px-3 py-2.5 text-xs text-[#8B92A8] hover:border-[#3B6FE8] hover:text-[#EEF0F6]">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs text-[#525A72]">
                Created {new Date(verifier.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#4A1515] bg-[#250F0F]/50 p-4">
              <div>
                <p className="text-sm font-medium text-[#EEF0F6]">Rotate this key</p>
                <p className="mt-1 text-xs text-[#8B92A8]">The old key will stop working immediately.</p>
              </div>
              <button
                onClick={() => void regenerateKey()}
                disabled={rotating}
                className="rounded-md border border-[#EF4444]/40 px-3 py-2 text-xs font-medium text-[#EF4444] hover:bg-[#EF4444]/10 disabled:opacity-50"
              >
                {rotating ? 'Rotating…' : 'Regenerate'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
