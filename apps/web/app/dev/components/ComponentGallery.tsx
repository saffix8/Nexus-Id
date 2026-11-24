'use client';

// Renders every shared component in every state (DESIGN.md §3.2, §5, §7).
// Time-dependent sample data is built in useEffect, never during render.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Activity, BadgeCheck, Clock, ShieldCheck, Trash2, WalletCards } from 'lucide-react';
import { PREDICATE_CODES, type VerificationOutcome } from '@nexusid/types';
import { Button } from '@/components/ui/button';
import {
  CodeBlock,
  CredentialCard,
  EmptyState,
  LiveLogTable,
  OUTCOME_STATES,
  OutcomeBadge,
  PredicateChip,
  QRPanel,
  StatCard,
  type LiveLogRow,
  type OutcomeState,
} from '@/components/nexus';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">{children}</p>;
}

const SAMPLE_CODE = `const res = await fetch("http://localhost:4000/api/v1/verification/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": "nx_live_…" },
  body: JSON.stringify({ requestedFields: ["AGE_OVER_18"] }),
});`;

const OUTCOMES: VerificationOutcome[] = ['VERIFIED', 'VERIFIED', 'FAILED', 'DECLINED', 'EXPIRED', 'PENDING'];

let rowSeq = 0;
function makeRow(at: number): LiveLogRow {
  rowSeq += 1;
  const n = rowSeq;
  const hex = (n * 2654435761).toString(16).padStart(8, '0');
  return {
    id: `row_${n}`,
    createdAt: new Date(at).toISOString(),
    sessionId: `sess_${hex}${hex.slice(0, 4)}a91c`,
    predicate: PREDICATE_CODES[n % PREDICATE_CODES.length],
    outcome: OUTCOMES[n % OUTCOMES.length],
    proofHash: OUTCOMES[n % OUTCOMES.length] === 'VERIFIED' ? `${hex}${hex}` : null,
  };
}

export function ComponentGallery({ area }: { area: 'user' | 'provider' }) {
  // QRPanel
  const [qrValue, setQrValue] = useState('nexusid://pair?token=demo-0001');
  const [qrStatus, setQrStatus] = useState<'waiting' | 'scanned' | 'paired'>('waiting');

  // LiveLogTable — rows built after mount (Date.now is client-only)
  const [rows, setRows] = useState<LiveLogRow[] | undefined>(undefined);
  useEffect(() => {
    const now = Date.now();
    const t = setTimeout(() => setRows([0, 1, 2, 3, 4].map((i) => makeRow(now - (i + 1) * 47_000))), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-text-muted">
          Every shared component in every state. The sidebar and top bar around this page are the{' '}
          <span className="font-mono text-xs text-foreground">AppShell</span> ({area === 'provider' ? 'Service Provider' : 'End User'} area).
        </p>
        <Button variant="secondary" size="sm" asChild>
          <Link href={area === 'provider' ? '/dev/components' : '/dev/components?area=provider'}>
            Show {area === 'provider' ? 'End User' : 'Service Provider'} shell
          </Link>
        </Button>
      </div>

      <Section id="outcome" title="OutcomeBadge — §3.2">
        <div className="flex flex-wrap gap-3">
          {(Object.keys(OUTCOME_STATES) as OutcomeState[]).map((s) => (
            <div key={s} className="flex flex-col items-start gap-1">
              <OutcomeBadge state={s} />
              <span className="font-mono text-[11px] text-text-muted">{s}</span>
            </div>
          ))}
          <div className="flex flex-col items-start gap-1">
            <OutcomeBadge state="pending" variant="dot" />
            <span className="font-mono text-[11px] text-text-muted">pending · dot</span>
          </div>
        </div>
      </Section>

      <Section id="predicate" title="PredicateChip — §5.6">
        <div className="flex flex-wrap gap-2">
          {PREDICATE_CODES.map((c) => (
            <PredicateChip key={c} code={c} />
          ))}
          <PredicateChip code="DRIVING_LICENSE_VALID" />
        </div>
        <p className="text-xs text-text-muted">Hover for the code. The last chip is outside the catalog (BR-021) and renders neutral.</p>
      </Section>

      <Section id="code" title="CodeBlock — §5.6">
        <CodeBlock label="javascript" code={SAMPLE_CODE} />
        <CodeBlock label="bash" code="npm install @nexusid/sd-jwt" copiedMessage="Command copied" />
      </Section>

      <Section id="qr" title="QRPanel — §5.4">
        <div className="flex flex-wrap gap-2">
          {(['waiting', 'scanned', 'paired'] as const).map((s) => (
            <Button key={s} size="sm" variant={qrStatus === s ? 'default' : 'secondary'} onClick={() => setQrStatus(s)}>
              {s}
            </Button>
          ))}
        </div>
        <QRPanel
          value={qrValue}
          status={qrStatus}
          onRefresh={() => {
            setQrStatus('waiting');
            setQrValue(`nexusid://pair?token=demo-${String(rowSeq++).padStart(4, '0')}`);
          }}
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <Label>Under 30 s (warning)</Label>
            <QRPanel value="nexusid://pair?token=demo-warn" startRemaining={28} layout="below" />
          </div>
          <div>
            <Label>Under 10 s (danger)</Label>
            <QRPanel value="nexusid://pair?token=demo-danger" startRemaining={9} layout="below" />
          </div>
          <div>
            <Label>Expired</Label>
            <QRPanel value="nexusid://pair?token=demo-expired" startRemaining={0} layout="below" onRefresh={() => toast('New code requested')} />
          </div>
          <div>
            <Label>Loading</Label>
            <QRPanel value={null} layout="below" />
          </div>
        </div>
      </Section>

      <Section id="credential" title="CredentialCard — §5.1">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <CredentialCard
            category="identity"
            status="valid"
            predicates={['AGE_OVER_18', 'AGE_OVER_21', 'NATIONALITY_PAKISTANI']}
            credentialId="cr_8f3a2b7c4d5e6f9091c2"
            expiresAt="2027-12-31T00:00:00.000Z"
            onClick={() => toast('Open credential detail')}
          />
          <CredentialCard
            category="education"
            status="valid"
            predicates={['DEGREE_BACHELOR_OR_HIGHER']}
            credentialId="cr_1b2c3d4e5f60718293aa"
            expiresAt="2030-06-30T00:00:00.000Z"
            actions={
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-text-muted hover:text-danger"
                aria-label="Delete credential"
                onClick={() => toast('Delete this credential?')}
              >
                <Trash2 className="size-4" strokeWidth={1.75} />
              </Button>
            }
          />
          <CredentialCard
            category="enrollment"
            status="valid"
            predicates={['ENROLLED_CURRENT', 'CGPA_AT_LEAST_2_0', 'CGPA_AT_LEAST_3_0']}
            credentialId="cr_aa01bb02cc03dd04ee05"
            expiresAt="2026-08-31T00:00:00.000Z"
          />
          <CredentialCard
            category="employment"
            status="expired"
            predicates={['EMPLOYMENT_ACTIVE']}
            credentialId="cr_99887766554433221100"
            expiresAt="2026-03-31T00:00:00.000Z"
          />
          <CredentialCard
            category="identity"
            status="revoked"
            predicates={['AGE_OVER_18']}
            credentialId="cr_deadbeefcafe00112233"
            expiresAt="2028-01-31T00:00:00.000Z"
          />
        </div>
      </Section>

      <Section id="stat" title="StatCard">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Verifications" value="1,284" icon={Activity} change="12% vs last week" trend="up" />
          <StatCard label="Success rate" value="94.2%" icon={BadgeCheck} change="1.3%" trend="down" />
          <StatCard label="Avg. response" value="3.1 s" icon={Clock} change="no change" trend="neutral" />
          <StatCard label="Credentials" icon={WalletCards} loading />
        </div>
      </Section>

      <Section id="empty" title="EmptyState — §7">
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            icon={WalletCards}
            title="No credentials yet"
            description="Add your first credential from NADRA, HEC, Air University or LinkedIn."
            action={{ label: 'Add credential', onClick: () => toast('Add credential') }}
          />
          <EmptyState
            icon={ShieldCheck}
            title="No verification requests"
            description="When a site asks you to prove something, the request shows up here."
            action={{ label: 'Pair a device', href: '/dev/components#qr' }}
          />
        </div>
      </Section>

      <Section id="log" title="LiveLogTable — §5.5">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setRows((r) => [makeRow(Date.now()), ...(r ?? [])])}>
            Simulate new verification
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.success('Credential added')}>
            Success toast
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.error('Proof signature invalid')}>
            Error toast
          </Button>
        </div>
        <LiveLogTable rows={rows} loading={!rows} live title="Live verifications" />
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <Label>Loading</Label>
            <LiveLogTable loading />
          </div>
          <div>
            <Label>Empty</Label>
            <LiveLogTable rows={[]} />
          </div>
        </div>
        <div>
          <Label>Error</Label>
          <LiveLogTable error="Invalid API key (401). Rotate the key on the API keys page." onRetry={() => toast('Retrying…')} />
        </div>
      </Section>
    </div>
  );
}
