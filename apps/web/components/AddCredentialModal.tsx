'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { SDJWTCredential } from '@nexusid/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type CredentialSource = 'nadra' | 'hec' | 'air-university' | 'linkedin';

type Step =
  | { id: 'source_select' }
  | { id: 'auth_flow'; source: CredentialSource }
  | { id: 'otp'; source: 'nadra'; sessionId: string }
  | { id: 'processing'; source: CredentialSource }
  | { id: 'success'; credential: SDJWTCredential }
  | { id: 'error'; message: string; source: CredentialSource };

interface AddCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCredentialAdded: () => void;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const T = {
  bg:        '#0C0E13',
  elevated:  '#13161E',
  inset:     '#0A0C10',
  overlay:   '#1A1E28',
  borderSub: '#1E2330',
  border:    '#252C3D',
  borderStr: '#3A4560',
  primary:   '#EEF0F6',
  secondary: '#8B92A8',
  tertiary:  '#525A72',
  accent:    '#3B6FE8',
  accentEnd: '#5B4FE8',
  success:   '#22C55E',
  successBg: '#0F2A1A',
  danger:    '#EF4444',
  dangerBg:  '#250F0F',
  warning:   '#F59E0B',
  warningBg: '#261D07',
};

// ─── Source Metadata ──────────────────────────────────────────────────────────

const SOURCE_META = {
  nadra: {
    label: 'NADRA Pakistan',
    description: 'Verify your CNIC and national identity',
    icon: '🆔',
    accent: '#3B82F6',
    accentBg: '#0D1B35',
    fields: ['Full Name', 'CNIC', 'Age', 'Gender', 'Address'],
  },
  hec: {
    label: 'Higher Education Commission',
    description: 'Verify your university degree',
    icon: '🎓',
    accent: '#8B5CF6',
    accentBg: '#1A0D35',
    fields: ['Degree Title', 'University', 'Graduation Year'],
  },
  'air-university': {
    label: 'Air University',
    description: 'Connect your student portal account',
    icon: '🏫',
    accent: '#10B981',
    accentBg: '#071E15',
    fields: ['Program', 'Enrollment Status', 'CGPA'],
  },
  linkedin: {
    label: 'LinkedIn',
    description: 'Import your employment history',
    icon: '💼',
    accent: '#0EA5E9',
    accentBg: '#071B26',
    fields: ['Current Employer', 'Job Title', 'Experience'],
  },
} as const;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const nadraSchema = z.object({
  cnic: z
    .string()
    .regex(/^\d{5}-\d{7}-\d$/, 'Format must be 12345-1234567-1'),
  phone: z
    .string()
    .min(10, 'Enter a valid mobile number')
    .regex(/^(\+92|0)?3\d{9}$/, 'Enter a valid Pakistani mobile number'),
});

const nadraOtpSchema = z.object({
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must be numeric'),
});

const hecSchema = z.object({
  degree_number: z.string().min(3, 'Enter your degree/roll number'),
  university:    z.string().min(2, 'Enter your university name'),
  student_name:  z.string().min(2, 'Enter your name as on the degree'),
});

const auSchema = z.object({
  username: z.string().min(2, 'Enter your portal username'),
  password: z.string().min(4, 'Enter your portal password'),
});

// ─── Utility: API fetch with JWT cookie ──────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? data?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const API = 'http://localhost:4000/api/v1';

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModalHeader({
  onBack,
  onClose,
  title,
  showBack,
}: {
  onBack: () => void;
  onClose: () => void;
  title: string;
  showBack: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b" style={{ borderColor: T.borderSub }}>
      {showBack ? (
        <button
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
          style={{ color: T.secondary }}
          onMouseEnter={e => (e.currentTarget.style.background = T.overlay)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          aria-label="Go back"
        >
          <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <div className="w-8" />
      )}

      <Dialog.Title
        className="flex-1 text-center text-base font-semibold"
        style={{ color: T.primary, fontFamily: 'DM Sans, sans-serif' }}
      >
        {title}
      </Dialog.Title>

      <button
        onClick={onClose}
        className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
        style={{ color: T.secondary }}
        onMouseEnter={e => (e.currentTarget.style.background = T.overlay)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        aria-label="Close modal"
      >
        <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-xs font-medium tracking-wide uppercase"
        style={{ color: T.secondary, fontFamily: 'Inter, sans-serif' }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs" style={{ color: T.danger }}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs" style={{ color: T.tertiary }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const inputClass = `
  w-full px-3 py-2.5 rounded-md text-sm outline-none transition-all duration-150
  bg-[#0A0C10] border text-[#EEF0F6] placeholder:text-[#525A72]
  focus:border-[#3B6FE8] focus:shadow-[0_0_0_3px_rgba(59,111,232,0.15)]
  border-[#252C3D]
`.trim();

// ─── Step: Source Selection ───────────────────────────────────────────────────

function SourceSelect({ onSelect }: { onSelect: (s: CredentialSource) => void }) {
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-center mb-5" style={{ color: T.secondary }}>
        Connect to a trusted source to verify your information
      </p>

      {(Object.entries(SOURCE_META) as [CredentialSource, typeof SOURCE_META['nadra']][]).map(
        ([key, meta]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 group"
            style={{ background: T.elevated, borderColor: T.border }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = meta.accent;
              e.currentTarget.style.boxShadow = `0 0 0 1px ${meta.accent}30`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: meta.accentBg, border: `1px solid ${meta.accent}25` }}
            >
              {meta.icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold mb-0.5" style={{ color: T.primary }}>
                {meta.label}
              </p>
              <p className="text-xs" style={{ color: T.secondary }}>
                {meta.description}
              </p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {meta.fields.map(f => (
                  <span
                    key={f}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: `${meta.accent}15`, color: meta.accent }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <svg
              viewBox="0 0 16 16"
              fill="none"
              width="16"
              height="16"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: T.tertiary }}
            >
              <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ),
      )}
    </div>
  );
}

// ─── Step: NADRA Form ─────────────────────────────────────────────────────────

type NadraFormData = z.infer<typeof nadraSchema>;
type NadraOtpData = z.infer<typeof nadraOtpSchema>;

function NadraFlow({
  onProcessing,
  onSuccess,
  onError,
}: {
  onProcessing: () => void;
  onSuccess: (cred: SDJWTCredential) => void;
  onError: (msg: string) => void;
}) {
  const [stage, setStage] = useState<'form' | 'otp'>('form');
  const [sessionId, setSessionId] = useState('');

  const {
    register: regForm,
    handleSubmit: handleForm,
    formState: { errors: formErrors, isSubmitting: formSubmitting },
  } = useForm<NadraFormData>({ resolver: zodResolver(nadraSchema) });

  const {
    register: regOtp,
    handleSubmit: handleOtp,
    formState: { errors: otpErrors, isSubmitting: otpSubmitting },
  } = useForm<NadraOtpData>({ resolver: zodResolver(nadraOtpSchema) });

  async function submitForm(data: NadraFormData) {
    try {
      const res = await apiFetch<{ session_id: string }>(`${API}/credentials/nadra/verify`, {
        method: 'POST',
        body: JSON.stringify({ cnic: data.cnic, phone: data.phone }),
      });
      setSessionId(res.session_id);
      setStage('otp');
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function submitOtp(data: NadraOtpData) {
    onProcessing();
    try {
      const res = await apiFetch<{ credential: SDJWTCredential }>(`${API}/credentials/nadra/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, otp: data.otp }),
      });
      onSuccess(res.credential);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  if (stage === 'otp') {
    return (
      <div className="p-6 space-y-5">
        <div className="rounded-lg p-4 text-sm" style={{ background: T.inset, color: T.secondary, borderLeft: `3px solid ${T.accent}` }}>
          Enter the 6-digit code sent to your registered mobile number.
        </div>

        <form onSubmit={handleOtp(submitOtp)} className="space-y-5">
          <FormField label="Verification Code" error={otpErrors.otp?.message}>
            <input
              {...regOtp('otp')}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className={inputClass}
              style={{ letterSpacing: '0.3em', fontSize: '20px', textAlign: 'center' }}
            />
          </FormField>

          <button
            type="submit"
            disabled={otpSubmitting}
            className="w-full h-11 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentEnd})`, color: '#fff' }}
          >
            {otpSubmitting ? 'Verifying…' : 'Verify Code'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-6">
      <form onSubmit={handleForm(submitForm)} className="space-y-5">
        <FormField
          label="CNIC Number"
          error={formErrors.cnic?.message}
          hint="Format: 12345-1234567-1"
        >
          <input
            {...regForm('cnic')}
            type="text"
            placeholder="12345-1234567-1"
            className={inputClass}
          />
        </FormField>

        <FormField label="Registered Mobile Number" error={formErrors.phone?.message}>
          <input
            {...regForm('phone')}
            type="tel"
            placeholder="03XX-XXXXXXX"
            className={inputClass}
          />
        </FormField>

        <button
          type="submit"
          disabled={formSubmitting}
          className="w-full h-11 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentEnd})`, color: '#fff' }}
        >
          {formSubmitting ? 'Sending OTP…' : 'Send Verification Code'}
        </button>
      </form>
    </div>
  );
}

// ─── Step: HEC Form ───────────────────────────────────────────────────────────

type HecFormData = z.infer<typeof hecSchema>;

function HECFlow({
  onProcessing,
  onSuccess,
  onError,
}: {
  onProcessing: () => void;
  onSuccess: (cred: SDJWTCredential) => void;
  onError: (msg: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<HecFormData>({ resolver: zodResolver(hecSchema) });

  async function onSubmit(data: HecFormData) {
    onProcessing();
    try {
      const res = await apiFetch<{ credential: SDJWTCredential }>(`${API}/credentials/hec/verify`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      onSuccess(res.credential);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <FormField label="Degree / Roll Number" error={errors.degree_number?.message}>
          <input
            {...register('degree_number')}
            type="text"
            placeholder="e.g. HEC/2024/123456"
            className={inputClass}
          />
        </FormField>

        <FormField label="University Name" error={errors.university?.message}>
          <input
            {...register('university')}
            type="text"
            placeholder="e.g. Air University Islamabad"
            className={inputClass}
          />
        </FormField>

        <FormField
          label="Full Name (as on degree)"
          error={errors.student_name?.message}
        >
          <input
            {...register('student_name')}
            type="text"
            placeholder="Your name exactly as printed"
            className={inputClass}
          />
        </FormField>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentEnd})`, color: '#fff' }}
        >
          {isSubmitting ? 'Verifying…' : 'Verify Degree'}
        </button>
      </form>
    </div>
  );
}

// ─── Step: Air University Form ────────────────────────────────────────────────

type AUFormData = z.infer<typeof auSchema>;

function AirUniversityFlow({
  onProcessing,
  onSuccess,
  onError,
}: {
  onProcessing: () => void;
  onSuccess: (cred: SDJWTCredential) => void;
  onError: (msg: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AUFormData>({ resolver: zodResolver(auSchema) });

  async function onSubmit(data: AUFormData) {
    onProcessing();
    try {
      const res = await apiFetch<{ credential: SDJWTCredential }>(`${API}/credentials/au/scrape`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      onSuccess(res.credential);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Consent warning */}
      <div
        className="rounded-lg p-4 flex gap-3"
        style={{ background: T.warningBg, border: `1px solid #4D3A0E` }}
      >
        <span className="text-lg shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: T.warning }}>
            One-time use only
          </p>
          <p className="text-xs leading-relaxed" style={{ color: '#A37A25' }}>
            Your portal credentials are used once to verify your enrollment and are
            immediately discarded. They are never stored or logged.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <FormField label="Portal Username" error={errors.username?.message}>
          <input
            {...register('username')}
            type="text"
            autoComplete="off"
            placeholder="Student portal username"
            className={inputClass}
          />
        </FormField>

        <FormField label="Portal Password" error={errors.password?.message}>
          <input
            {...register('password')}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className={inputClass}
          />
        </FormField>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentEnd})`, color: '#fff' }}
        >
          {isSubmitting ? 'Connecting…' : 'Connect Portal'}
        </button>
      </form>
    </div>
  );
}

// ─── Step: LinkedIn Flow ──────────────────────────────────────────────────────

function LinkedInFlow({
  onSuccess,
  onError,
}: {
  onSuccess: (cred: SDJWTCredential) => void;
  onError: (msg: string) => void;
}) {
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function startLinkedIn() {
    try {
      const res = await apiFetch<{ auth_url: string }>(`${API}/credentials/linkedin/auth-url`);
      window.open(res.auth_url, '_blank', 'width=600,height=700');
      setPolling(true);

      pollRef.current = setInterval(async () => {
        try {
          const status = await apiFetch<{ status: string; credential?: SDJWTCredential }>(
            `${API}/credentials/linkedin/status`,
          );
          if (status.status === 'completed' && status.credential) {
            stopPolling();
            setPolling(false);
            onSuccess(status.credential);
          } else if (status.status === 'failed') {
            stopPolling();
            setPolling(false);
            onError('LinkedIn authorisation failed. Please try again.');
          }
        } catch {
          // transient — keep polling
        }
      }, 2000);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-xl p-5 text-center" style={{ background: T.inset, border: `1px solid ${T.border}` }}>
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl mx-auto mb-3"
          style={{ background: '#071B26', border: '1px solid #0EA5E920' }}
        >
          💼
        </div>
        <p className="text-sm font-medium mb-1" style={{ color: T.primary }}>
          Import from LinkedIn
        </p>
        <p className="text-xs leading-relaxed" style={{ color: T.secondary }}>
          You'll be redirected to LinkedIn to authorise NexusID. Only your
          professional profile and current employment data is read.
        </p>
      </div>

      {polling ? (
        <div className="text-center space-y-3">
          <div
            className="w-8 h-8 border-2 rounded-full mx-auto animate-spin"
            style={{ borderColor: T.border, borderTopColor: T.accent }}
          />
          <p className="text-sm" style={{ color: T.secondary }}>
            Waiting for LinkedIn authorisation…
          </p>
          <button
            onClick={() => { stopPolling(); setPolling(false); }}
            className="text-xs underline"
            style={{ color: T.tertiary }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={startLinkedIn}
          className="w-full h-11 rounded-lg text-sm font-semibold transition-opacity"
          style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentEnd})`, color: '#fff' }}
        >
          Open LinkedIn
        </button>
      )}

      <p className="text-xs text-center" style={{ color: T.tertiary }}>
        NexusID does not store your LinkedIn password or session.
      </p>
    </div>
  );
}

// ─── Step: Processing ─────────────────────────────────────────────────────────

function ProcessingStep({ source }: { source: CredentialSource }) {
  const meta = SOURCE_META[source];
  return (
    <div className="p-10 flex flex-col items-center justify-center gap-5 min-h-[260px]">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl animate-pulse"
        style={{ background: meta.accentBg, border: `1px solid ${meta.accent}30` }}
      >
        {meta.icon}
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-semibold" style={{ color: T.primary }}>
          Verifying with {meta.label}
        </p>
        <p className="text-sm" style={{ color: T.secondary }}>
          This usually takes a few seconds…
        </p>
      </div>
      <div
        className="w-48 h-1 rounded-full overflow-hidden"
        style={{ background: T.border }}
      >
        <div
          className="h-full rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
          style={{
            width: '40%',
            background: `linear-gradient(90deg, ${meta.accent}80, ${meta.accent}, ${meta.accent}80)`,
            backgroundSize: '200% 100%',
            animation: 'indeterminate 1.5s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  );
}

// ─── Step: Success ────────────────────────────────────────────────────────────

function SuccessStep({
  credential,
  onDone,
}: {
  credential: SDJWTCredential;
  onDone: () => void;
}) {
  const alwaysVisible = credential.metadata?.always_visible_fields ?? [];
  const labels = credential.metadata?.field_labels ?? {};

  return (
    <div className="p-6 space-y-6">
      {/* Animated checkmark */}
      <div className="flex flex-col items-center gap-4 pt-2">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: '#0F2A1A', border: `1px solid #16532F` }}
        >
          <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
            <path
              d="M5 13l4 4L19 7"
              stroke="#22C55E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 30,
                strokeDashoffset: 0,
                animation: 'dash 0.5s ease-out forwards',
              }}
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold" style={{ color: T.primary, fontFamily: 'DM Sans, sans-serif' }}>
            Credential Added
          </p>
          <p className="text-sm mt-1" style={{ color: T.secondary }}>
            Successfully verified and saved to your wallet
          </p>
        </div>
      </div>

      {/* Always-visible field summary */}
      {alwaysVisible.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
          <div className="px-4 py-2.5" style={{ background: T.overlay }}>
            <p className="text-xs font-mono tracking-wider uppercase" style={{ color: T.tertiary }}>
              Verified Information
            </p>
          </div>
          <div style={{ background: T.elevated }}>
            {alwaysVisible.map((field, i) => {
              const value = (credential as unknown as Record<string, unknown>)[field];
              return (
                <div
                  key={field}
                  className="flex items-baseline justify-between px-4 py-3"
                  style={{
                    borderTop: i > 0 ? `1px solid ${T.borderSub}` : 'none',
                  }}
                >
                  <span className="text-xs font-mono uppercase tracking-wide" style={{ color: T.tertiary }}>
                    {labels[field] ?? field}
                  </span>
                  <span className="text-sm font-medium ml-4 text-right" style={{ color: T.primary }}>
                    {String(value ?? '—')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onDone}
        className="w-full h-11 rounded-lg text-sm font-semibold"
        style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentEnd})`, color: '#fff' }}
      >
        Done
      </button>
    </div>
  );
}

// ─── Step: Error ──────────────────────────────────────────────────────────────

function ErrorStep({
  message,
  onRetry,
  onChangSource,
}: {
  message: string;
  onRetry: () => void;
  onChangSource: () => void;
}) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col items-center gap-4 pt-2">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: T.dangerBg, border: `1px solid #4A1515` }}
        >
          <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
            <path d="M6 6l12 12M18 6L6 18" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold" style={{ color: T.primary, fontFamily: 'DM Sans, sans-serif' }}>
            Verification Failed
          </p>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: T.secondary }}>
            {message}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={onRetry}
          className="w-full h-11 rounded-lg text-sm font-semibold"
          style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentEnd})`, color: '#fff' }}
        >
          Try Again
        </button>
        <button
          onClick={onChangSource}
          className="w-full h-11 rounded-lg text-sm font-medium border transition-colors"
          style={{
            background: 'transparent',
            borderColor: T.border,
            color: T.secondary,
          }}
        >
          Use a Different Source
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AddCredentialModal({
  isOpen,
  onClose,
  onCredentialAdded,
}: AddCredentialModalProps) {
  const [step, setStep] = useState<Step>({ id: 'source_select' });

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => setStep({ id: 'source_select' }), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  function handleClose() {
    onClose();
  }

  function handleBack() {
    if (step.id === 'auth_flow' || step.id === 'error') {
      setStep({ id: 'source_select' });
    } else if (step.id === 'otp') {
      setStep({ id: 'auth_flow', source: 'nadra' });
    }
  }

  function handleSelect(source: CredentialSource) {
    setStep({ id: 'auth_flow', source });
  }

  function handleProcessing(source: CredentialSource) {
    setStep({ id: 'processing', source });
  }

  function handleSuccess(credential: SDJWTCredential) {
    setStep({ id: 'success', credential });
  }

  function handleError(source: CredentialSource, message: string) {
    setStep({ id: 'error', message, source });
  }

  function handleDone() {
    onCredentialAdded();
    handleClose();
  }

  // ── Derive header title ──
  const headerTitle = (() => {
    if (step.id === 'source_select') return 'Add a Credential';
    if (step.id === 'auth_flow' || step.id === 'otp') return SOURCE_META[step.source].label;
    if (step.id === 'processing') return SOURCE_META[step.source].label;
    if (step.id === 'success') return 'Credential Added';
    if (step.id === 'error') return 'Verification Failed';
    return 'Add a Credential';
  })();

  const showBack = step.id === 'auth_flow' || step.id === 'otp' || step.id === 'error';

  // ── Current source for callbacks ──
  const currentSource: CredentialSource =
    step.id === 'auth_flow' || step.id === 'otp' || step.id === 'processing' || step.id === 'error'
      ? step.source
      : 'nadra';

  return (
    <>
      {/* Indeterminate bar keyframe (injected once) */}
      <style>{`
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes dash {
          from { stroke-dashoffset: 30; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={handleClose}>
          {/* Backdrop */}
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
          </Transition.Child>

          {/* Panel */}
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-250"
              enterFrom="opacity-0 scale-95 translate-y-4"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 translate-y-2"
            >
              <Dialog.Panel
                className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: T.bg, border: `1px solid ${T.border}` }}
              >
                <ModalHeader
                  title={headerTitle}
                  showBack={showBack}
                  onBack={handleBack}
                  onClose={handleClose}
                />

                {/* Source header strip for auth/processing steps */}
                {(step.id === 'auth_flow' || step.id === 'otp' || step.id === 'processing') && (
                  <div
                    className="px-6 py-3 flex items-center gap-3"
                    style={{
                      background: SOURCE_META[step.source].accentBg,
                      borderBottom: `1px solid ${SOURCE_META[step.source].accent}20`,
                    }}
                  >
                    <span className="text-xl">{SOURCE_META[step.source].icon}</span>
                    <div>
                      <p className="text-xs font-mono tracking-wider uppercase" style={{ color: SOURCE_META[step.source].accent }}>
                        Credential Source
                      </p>
                      <p className="text-sm font-medium" style={{ color: T.primary }}>
                        {SOURCE_META[step.source].label}
                      </p>
                    </div>
                  </div>
                )}

                {/* Scrollable body */}
                <div className="overflow-y-auto max-h-[70vh]">
                  {step.id === 'source_select' && (
                    <SourceSelect onSelect={handleSelect} />
                  )}

                  {step.id === 'auth_flow' && step.source === 'nadra' && (
                    <NadraFlow
                      onProcessing={() => handleProcessing('nadra')}
                      onSuccess={handleSuccess}
                      onError={msg => handleError('nadra', msg)}
                    />
                  )}

                  {step.id === 'auth_flow' && step.source === 'hec' && (
                    <HECFlow
                      onProcessing={() => handleProcessing('hec')}
                      onSuccess={handleSuccess}
                      onError={msg => handleError('hec', msg)}
                    />
                  )}

                  {step.id === 'auth_flow' && step.source === 'air-university' && (
                    <AirUniversityFlow
                      onProcessing={() => handleProcessing('air-university')}
                      onSuccess={handleSuccess}
                      onError={msg => handleError('air-university', msg)}
                    />
                  )}

                  {step.id === 'auth_flow' && step.source === 'linkedin' && (
                    <LinkedInFlow
                      onSuccess={handleSuccess}
                      onError={msg => handleError('linkedin', msg)}
                    />
                  )}

                  {step.id === 'processing' && (
                    <ProcessingStep source={step.source} />
                  )}

                  {step.id === 'success' && (
                    <SuccessStep credential={step.credential} onDone={handleDone} />
                  )}

                  {step.id === 'error' && (
                    <ErrorStep
                      message={step.message}
                      onRetry={() => setStep({ id: 'auth_flow', source: step.source })}
                      onChangSource={() => setStep({ id: 'source_select' })}
                    />
                  )}
                </div>

                {/* Footer disclaimer — shown on auth_flow steps */}
                {step.id === 'auth_flow' && (
                  <div
                    className="px-6 py-3 text-center"
                    style={{ borderTop: `1px solid ${T.borderSub}` }}
                  >
                    <p className="text-xs" style={{ color: T.tertiary }}>
                      Your data is used once to verify. Nothing is stored on our servers.
                    </p>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
