'use client';

import { useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldGroup {
  label: string;
  color: string;
  fields: { key: string; label: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_GROUPS: FieldGroup[] = [
  {
    label: 'Identity',
    color: '#3B82F6',
    fields: [
      { key: 'full_name', label: 'Full Name' },
      { key: 'cnic', label: 'CNIC Number' },
      { key: 'age', label: 'Age' },
      { key: 'age_over_18', label: 'Age Over 18' },
      { key: 'gender', label: 'Gender' },
    ],
  },
  {
    label: 'Education',
    color: '#8B5CF6',
    fields: [
      { key: 'degree_title', label: 'Degree Title' },
      { key: 'university', label: 'University' },
      { key: 'year_of_award', label: 'Year of Award' },
      { key: 'registration_number', label: 'Registration No.' },
    ],
  },
  {
    label: 'Employment',
    color: '#0EA5E9',
    fields: [
      { key: 'current_company', label: 'Current Company' },
      { key: 'current_title', label: 'Job Title' },
      { key: 'employment_status', label: 'Employment Status' },
      { key: 'experience_years', label: 'Years of Experience' },
    ],
  },
  {
    label: 'Enrollment',
    color: '#10B981',
    fields: [
      { key: 'program', label: 'Program' },
      { key: 'enrollment_status', label: 'Enrollment Status' },
      { key: 'department', label: 'Department' },
      { key: 'cgpa', label: 'CGPA' },
    ],
  },
];

const VERIFIER_DOMAIN = 'demo-jobportal.com';
const VERIFIER_NAME_DEFAULT = 'Demo Job Portal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildSnippet(
  domain: string,
  displayName: string,
  fields: string[],
  nonce: string,
  callbackUrl: string
): string {
  const lines = [
    `<div`,
    `  id="nexusid-verify"`,
    `  data-verifier-id="${domain}"`,
    `  data-verifier-name="${displayName}"`,
    `  data-fields="${fields.join(',')}"`,
    `  data-nonce="${nonce}"`,
    callbackUrl ? `  data-callback-url="${callbackUrl}"` : null,
    `>`,
    `  <!-- NexusID verification widget renders here -->`,
    `</div>`,
    ``,
    `<!-- Add once per page -->`,
    `<script src="https://cdn.nexusid.com/widget.js" defer></script>`,
  ]
    .filter((l) => l !== null)
    .join('\n');
  return lines;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-4 mb-5">
      <span
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono font-semibold mt-0.5"
        style={{ background: 'rgba(59,111,232,0.15)', color: '#3B6FE8', border: '1px solid rgba(59,111,232,0.25)' }}
      >
        {number}
      </span>
      <div>
        <h2 className="text-sm font-semibold text-[#EEF0F6]">{title}</h2>
        {subtitle && <p className="text-xs text-[#525A72] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
      style={{
        background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(59,111,232,0.1)',
        color: copied ? '#22C55E' : '#3B6FE8',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.25)' : 'rgba(59,111,232,0.25)'}`,
      }}
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.25" />
            <path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.25" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreateRequestPage() {
  const [displayName, setDisplayName] = useState(VERIFIER_NAME_DEFAULT);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(['age_over_18', 'degree_title']));
  const [callbackUrl, setCallbackUrl] = useState('');
  const [nonce] = useState(() => generateNonce());
  const [testOpen, setTestOpen] = useState(false);

  const toggleField = useCallback((key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const fieldsArray = Array.from(selectedFields);
  const snippet = buildSnippet(VERIFIER_DOMAIN, displayName, fieldsArray, nonce, callbackUrl);

  return (
    <div className="max-w-6xl">
      <div className="grid grid-cols-[1fr_1fr] gap-6 items-start">

        {/* ── LEFT: Form ── */}
        <div className="space-y-6">

          {/* Section 1 — Verifier Info */}
          <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
            <SectionHeader number={1} title="Your Information" subtitle="Pre-filled from your verifier account" />

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#8B92A8] mb-1.5 tracking-wide">
                  Verified Domain
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#0A0C10] border border-[#1E2330] rounded-md">
                  <svg className="w-3.5 h-3.5 text-[#22C55E] flex-shrink-0" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-mono text-[#EEF0F6]">{VERIFIER_DOMAIN}</span>
                  <span className="ml-auto text-[10px] font-mono tracking-wider uppercase text-[#22C55E] bg-[#0F2A1A] border border-[#16532F] px-1.5 py-0.5 rounded">
                    Verified
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8B92A8] mb-1.5 tracking-wide">
                  Display Name <span className="text-[#525A72]">(shown to users)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Company Name"
                  className="w-full px-3 py-2.5 bg-[#0A0C10] border border-[#252C3D] rounded-md text-sm text-[#EEF0F6] placeholder:text-[#525A72] outline-none focus:border-[#3B6FE8] focus:shadow-[0_0_0_3px_rgba(59,111,232,0.1)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8B92A8] mb-1.5 tracking-wide">
                  Callback URL <span className="text-[#525A72]">(optional — redirect after verification)</span>
                </label>
                <input
                  type="url"
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  placeholder="https://yoursite.com/verification-complete"
                  className="w-full px-3 py-2.5 bg-[#0A0C10] border border-[#252C3D] rounded-md text-sm text-[#EEF0F6] placeholder:text-[#525A72] outline-none focus:border-[#3B6FE8] focus:shadow-[0_0_0_3px_rgba(59,111,232,0.1)] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 2 — Choose Fields */}
          <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
            <SectionHeader
              number={2}
              title="Choose What to Request"
              subtitle={`${selectedFields.size} field${selectedFields.size !== 1 ? 's' : ''} selected`}
            />

            <div className="space-y-5">
              {FIELD_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: group.color }}
                    />
                    <span
                      className="text-[10px] font-mono tracking-wider uppercase font-semibold"
                      style={{ color: group.color }}
                    >
                      {group.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.fields.map((field) => {
                      const checked = selectedFields.has(field.key);
                      return (
                        <button
                          key={field.key}
                          onClick={() => toggleField(field.key)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all duration-150"
                          style={{
                            background: checked ? `${group.color}10` : '#0A0C10',
                            border: `1px solid ${checked ? `${group.color}35` : '#1E2330'}`,
                          }}
                        >
                          <span
                            className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all"
                            style={{
                              background: checked ? group.color : 'transparent',
                              border: `1.5px solid ${checked ? group.color : '#3A4560'}`,
                            }}
                          >
                            {checked && (
                              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span
                            className="text-xs font-medium transition-colors"
                            style={{ color: checked ? '#EEF0F6' : '#8B92A8' }}
                          >
                            {field.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selectedFields.size === 0 && (
              <div className="mt-4 px-3 py-2 bg-[#261D07] border border-[#4D3A0E] rounded-md">
                <p className="text-xs text-[#F59E0B]">Select at least one field to generate the integration code.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Live Preview ── */}
        <div className="space-y-5 sticky top-6">

          {/* Section 3 — Generated Code */}
          <div className="bg-[#13161E] border border-[#1E2330] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2330]">
              <div>
                <div className="flex items-center gap-2">
                  <SectionNumberBadge n={3} />
                  <span className="text-sm font-semibold text-[#EEF0F6]">Generated Code</span>
                </div>
                <p className="text-xs text-[#525A72] mt-0.5 ml-9">Updates live as you select fields</p>
              </div>
              <CopyButton text={snippet} />
            </div>

            {/* Terminal block */}
            <div className="bg-[#0A0C10] p-5 overflow-x-auto">
              <div className="flex items-center gap-1.5 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]/60" />
                <span className="ml-2 text-[10px] font-mono text-[#525A72]">integration.html</span>
              </div>
              <pre className="text-xs font-mono leading-relaxed whitespace-pre text-[#EEF0F6]">
                <CodeHighlight snippet={snippet} />
              </pre>
            </div>
          </div>

          {/* Section 3b — Widget Preview */}
          <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <SectionNumberBadge n={3} label="b" />
              <span className="text-sm font-semibold text-[#EEF0F6]">Widget Preview</span>
            </div>
            <p className="text-xs text-[#525A72] mb-4">How the NexusID widget appears on your page</p>

            {/* Mock page frame */}
            <div className="rounded-lg border border-[#252C3D] bg-[#0A0C10] overflow-hidden">
              {/* Fake browser bar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1E2330] bg-[#13161E]">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#252C3D]" />
                  <span className="w-2 h-2 rounded-full bg-[#252C3D]" />
                  <span className="w-2 h-2 rounded-full bg-[#252C3D]" />
                </div>
                <div className="flex-1 bg-[#0A0C10] border border-[#1E2330] rounded text-[10px] font-mono text-[#525A72] px-2 py-0.5 text-center">
                  {VERIFIER_DOMAIN}/apply
                </div>
              </div>

              {/* Page content */}
              <div className="p-4 space-y-3">
                <div className="h-3 w-2/3 bg-[#1A1E28] rounded" />
                <div className="h-2 w-full bg-[#1A1E28] rounded" />
                <div className="h-2 w-5/6 bg-[#1A1E28] rounded" />

                {/* The NexusID widget */}
                <div
                  className="rounded-lg p-4 mt-3"
                  style={{
                    border: '1.5px solid rgba(59,111,232,0.4)',
                    background: 'rgba(59,111,232,0.04)',
                    boxShadow: '0 0 0 4px rgba(59,111,232,0.06)',
                    animation: 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
                  }}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-[#3B6FE8] to-[#5B4FE8] flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1.5L12.5 4.5v5L7 12.5 1.5 9.5v-5L7 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#EEF0F6]">NexusID Verification</p>
                      <p className="text-[10px] text-[#525A72]">by {displayName || VERIFIER_DOMAIN}</p>
                    </div>
                  </div>

                  {selectedFields.size > 0 ? (
                    <>
                      <p className="text-[10px] text-[#8B92A8] mb-2">
                        Requesting verification of:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {fieldsArray.slice(0, 5).map((f) => {
                          const label = FIELD_GROUPS.flatMap((g) => g.fields).find((x) => x.key === f)?.label ?? f;
                          return (
                            <span
                              key={f}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(59,111,232,0.1)', color: '#3B6FE8', border: '1px solid rgba(59,111,232,0.2)' }}
                            >
                              {label}
                            </span>
                          );
                        })}
                        {fieldsArray.length > 5 && (
                          <span className="text-[10px] font-mono text-[#525A72]">+{fieldsArray.length - 5} more</span>
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t border-[#1E2330] flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
                        <span className="text-[10px] text-[#8B92A8]">Waiting for phone approval…</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] text-[#525A72]">Select fields on the left to see the preview.</p>
                  )}
                </div>

                <div className="h-2 w-3/4 bg-[#1A1E28] rounded" />
              </div>
            </div>
          </div>

          {/* Section 4 — Test It */}
          <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <SectionNumberBadge n={4} />
              <span className="text-sm font-semibold text-[#EEF0F6]">Test It</span>
            </div>
            <p className="text-xs text-[#525A72] mb-4">
              Open a test page with a mock form to walk through the complete verification flow.
            </p>

            <button
              disabled={selectedFields.size === 0}
              onClick={() => {
                const params = new URLSearchParams({
                  verifier_id: VERIFIER_DOMAIN,
                  verifier_name: displayName,
                  fields: fieldsArray.join(','),
                  nonce,
                });
                window.open(`/verifier/test?${params}`, '_blank');
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(59,111,232,0.1)',
                color: '#3B6FE8',
                border: '1px solid rgba(59,111,232,0.25)',
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path d="M3 8a5 5 0 1010 0A5 5 0 003 8z" stroke="currentColor" strokeWidth="1.25" />
                <path d="M7 6l3 2-3 2V6z" fill="currentColor" />
              </svg>
              Test this verification
              <span className="text-[10px] opacity-60">↗</span>
            </button>

            {selectedFields.size === 0 && (
              <p className="text-[10px] text-[#525A72] mt-2 text-center">Select at least one field first</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function SectionNumberBadge({ n, label }: { n: number; label?: string }) {
  return (
    <span
      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-mono font-semibold"
      style={{ background: 'rgba(59,111,232,0.15)', color: '#3B6FE8', border: '1px solid rgba(59,111,232,0.25)' }}
    >
      {n}{label}
    </span>
  );
}

function CodeHighlight({ snippet }: { snippet: string }) {
  // Colorise the HTML snippet with simple token rules
  const lines = snippet.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        // data-* attributes
        let rendered = line
          .replace(/(data-[\w-]+)(=)("([^"]*)")/g, (_, attr, eq, quoted, val) => {
            const attrHtml = `<span style="color:#8B92A8">${attr}</span>`;
            const eqHtml = `<span style="color:#525A72">${eq}</span>`;
            const valHtml = `<span style="color:#22C55E">"${val}"</span>`;
            return attrHtml + eqHtml + valHtml;
          })
          // id attribute
          .replace(/\bid="([^"]+)"/g, `<span style="color:#8B92A8">id</span>=<span style="color:#22C55E">"$1"</span>`)
          // tags
          .replace(/(&lt;|<)(\/?)(\w+)/g, `<span style="color:#EEF0F6">$1$2</span><span style="color:#3B6FE8">$3</span>`)
          // comments
          .replace(/(&lt;!--|<!--)(.*?)(--&gt;|-->)/g, `<span style="color:#525A72">&lt;!--$2--&gt;</span>`);

        return (
          <span key={i}>
            <span dangerouslySetInnerHTML={{ __html: rendered }} />
            {'\n'}
          </span>
        );
      })}
    </>
  );
}
