import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { SDJWTCredential } from '@nexusid/types';
import { formatDistanceToNow, isPast, differenceInDays } from 'date-fns';

const CREDENTIAL_META = {
  identity: {
    label: 'National Identity',
    issuer: 'NADRA Pakistan',
    icon: '🆔',
    accent: '#3B82F6',
    accentBg: '#0D1B35',
    gradient: 'from-[#0D1B35] to-[#0C0E13]',
    pattern: 'identity',
  },
  education: {
    label: 'Education',
    issuer: 'Higher Education Commission',
    icon: '🎓',
    accent: '#8B5CF6',
    accentBg: '#1A0D35',
    gradient: 'from-[#1A0D35] to-[#0C0E13]',
    pattern: 'education',
  },
  employment: {
    label: 'Employment',
    issuer: 'LinkedIn',
    icon: '💼',
    accent: '#0EA5E9',
    accentBg: '#071B26',
    gradient: 'from-[#071B26] to-[#0C0E13]',
    pattern: 'employment',
  },
  enrollment: {
    label: 'Enrollment',
    issuer: 'Air University',
    icon: '🏫',
    accent: '#10B981',
    accentBg: '#071E15',
    gradient: 'from-[#071E15] to-[#0C0E13]',
    pattern: 'enrollment',
  },
} as const;

function getStatus(expiresAt: string): 'active' | 'expiring' | 'expired' {
  const exp = new Date(expiresAt);
  if (isPast(exp)) return 'expired';
  if (differenceInDays(exp, new Date()) < 30) return 'expiring';
  return 'active';
}

interface CredentialCardProps {
  credential: SDJWTCredential;
  onDelete: () => void;
  onQR: () => void;
  onView: () => void;
}

export function CredentialCard({ credential, onDelete, onQR, onView }: CredentialCardProps) {
  const meta = CREDENTIAL_META[credential.type];
  const status = getStatus(credential.expires_at);
  const statusLabel = { active: 'Active', expiring: 'Expiring Soon', expired: 'Expired' }[status];

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated transition-all duration-300 hover:border-border-strong hover:shadow-lg cursor-pointer"
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onView()}
      aria-label={`${meta.label} credential from ${meta.issuer}`}
    >
      {/* Document Header Strip — the signature design element */}
      <div
        className={`relative h-24 bg-gradient-to-br ${meta.gradient} overflow-hidden`}
        style={{ borderBottom: `1px solid ${meta.accent}20` }}
      >
        {/* Subtle diagonal pattern — like a security document */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              ${meta.accent} 0px,
              ${meta.accent} 1px,
              transparent 1px,
              transparent 12px
            )`,
          }}
        />

        {/* Issuer logo area */}
        <div className="absolute top-4 left-4 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{ background: `${meta.accent}20`, border: `1px solid ${meta.accent}30` }}
          >
            {meta.icon}
          </div>
          <div>
            <p className="text-xs font-mono tracking-wider uppercase" style={{ color: meta.accent }}>
              {meta.label}
            </p>
            <p className="text-sm font-medium text-text-primary">{meta.issuer}</p>
          </div>
        </div>

        {/* Status badge — top right */}
        <div className="absolute top-4 right-4">
          <Badge variant={status} size="sm" dot>
            {statusLabel}
          </Badge>
        </div>

        {/* Decorative accent line at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, ${meta.accent}80, transparent)` }}
        />
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        {/* Always-visible fields */}
        <div className="space-y-2">
          {Object.entries(credential.metadata?.field_labels || {})
            .filter(([key]) => credential.metadata?.always_visible_fields.includes(key))
            .slice(0, 3)
            .map(([key, label]) => (
              <div key={key} className="flex items-baseline justify-between gap-4">
                <span className="text-xs text-text-tertiary font-mono uppercase tracking-wide shrink-0">
                  {label}
                </span>
                <span className="text-sm text-text-primary text-right truncate">
                  {String((credential as any)[key] ?? '—')}
                </span>
              </div>
            ))}
        </div>

        {/* Selectively disclosable count */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border-subtle">
          <svg className="w-3 h-3 text-text-tertiary" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 6V4.5a3 3 0 016 0V6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="text-xs text-text-tertiary">
            {credential.metadata?.selectively_disclosable_fields.length ?? 0} private fields
          </span>
          <span className="text-xs text-text-tertiary ml-auto font-mono">
            Issued {formatDistanceToNow(new Date(credential.issued_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Hover action overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
        <div
          className="w-full flex gap-2 p-3"
          onClick={(e) => e.stopPropagation()}
          style={{ background: 'linear-gradient(to top, rgba(12,14,19,0.95) 60%, transparent)' }}
        >
          <Button variant="secondary" size="sm" className="flex-1" onClick={onQR}>
            Generate QR
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete credential">
            <svg className="w-4 h-4 text-danger" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}
