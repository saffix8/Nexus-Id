"use client";

// Add credential — web stand-in for mobile SCR-004/005 (FR-006, FR-007; DESIGN.md §6.2).
// State machine: device key → pick source → issuer form [→ NADRA OTP] → processing → success | error.
// The issuer signs an SD-JWT bound to this browser's key; the browser keeps it encrypted (lib/webWallet.ts).
// Success shows the credential card with predicate labels only, never raw attribute values (§5.1).

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ArrowLeft,
  CircleAlert,
  CircleX,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  predicateLabel,
  type CredentialType,
  type SDJWTCredential,
} from "@nexusid/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AuthField } from "@/components/nexus/AuthFrame";
import { CredentialCard } from "@/components/nexus/CredentialCard";
import { categoryMeta, predicatesFor } from "@/components/nexus/category";
import { ensureWebKeypair } from "@/lib/webKeypair";
import { saveWebCredential } from "@/lib/webWallet";
import { parseForm } from "@/lib/forms";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CredentialSource = "nadra" | "hec" | "air-university" | "linkedin";

type Step =
  | { id: "preparing_key" }
  | { id: "key_error"; message: string }
  | { id: "source_select" }
  | { id: "auth_flow"; source: CredentialSource }
  | { id: "processing"; source: CredentialSource }
  | { id: "success"; credential: SDJWTCredential }
  | { id: "error"; message: string; source: CredentialSource };

interface AddCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCredentialAdded: () => void;
}

const SOURCES: { source: CredentialSource; category: CredentialType }[] = [
  { source: "nadra", category: "identity" },
  { source: "hec", category: "education" },
  { source: "air-university", category: "enrollment" },
  { source: "linkedin", category: "employment" },
];

const CATEGORY_OF: Record<CredentialSource, CredentialType> = {
  nadra: "identity",
  hec: "education",
  "air-university": "enrollment",
  linkedin: "employment",
};

const issuerName = (source: CredentialSource) =>
  categoryMeta(CATEGORY_OF[source]).issuerName;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const nadraSchema = z.object({
  cnic: z.string().regex(/^\d{5}-\d{7}-\d$/, "Use the format 12345-1234567-1"),
  phone: z
    .string()
    .min(10, "Enter your mobile number")
    .regex(
      /^(\+92|0)?3\d{9}$/,
      "Enter a Pakistani mobile number, e.g. 03001234567",
    ),
});
const nadraOtpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
const hecSchema = z.object({
  degree_number: z.string().min(3, "Enter your degree or roll number"),
  university: z.string().min(2, "Enter your university"),
  student_name: z.string().min(2, "Enter your name as printed on the degree"),
});
const auSchema = z.object({
  username: z.string().min(2, "Enter your portal username"),
  password: z.string().min(4, "Enter your portal password"),
});

type NadraFormData = z.infer<typeof nadraSchema>;
type NadraOtpData = z.infer<typeof nadraOtpSchema>;
type HecFormData = z.infer<typeof hecSchema>;
type AUFormData = z.infer<typeof auSchema>;

// ─── API ──────────────────────────────────────────────────────────────────────

const API = "/api/v1";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(
      data?.error ??
        data?.message ??
        `The issuer answered ${res.status}. Try again.`,
    );
  }
  // Backend and issuers reply { success, data, timestamp } (SRS §5.3). Callers want the payload.
  if (data && typeof data === "object" && "success" in data && "data" in data)
    return data.data as T;
  return data as T;
}

// ─── Input masks ──────────────────────────────────────────────────────────────

/** Digits only, dashes inserted as typed: 12345-1234567-1. */
function formatCnic(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/** Pakistani mobile: digits, optional leading +, no spaces or dashes. */
function formatPhone(value: string): string {
  const plus = value.trimStart().startsWith("+");
  const d = value.replace(/\D/g, "").slice(0, 12);
  return plus ? `+${d}` : d.slice(0, 11);
}

const digitsOnly = (value: string, max: number) =>
  value.replace(/\D/g, "").slice(0, max);

/** Wraps a react-hook-form register() result so the value is masked before RHF reads it. */
function masked<
  T extends { onChange: (e: ChangeEvent<HTMLInputElement>) => unknown },
>(field: T, mask: (v: string) => string): T {
  return {
    ...field,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      e.target.value = mask(e.target.value);
      return field.onChange(e);
    },
  };
}

const aria = (id: string, error?: string) => ({
  id,
  "aria-invalid": !!error,
  "aria-describedby": error ? `${id}-error` : undefined,
});

function SubmitButton({
  busy,
  busyLabel,
  label,
}: {
  busy: boolean;
  busyLabel: string;
  label: string;
}) {
  return (
    <Button type="submit" className="w-full" disabled={busy}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {busy ? busyLabel : label}
    </Button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border-subtle bg-inset px-3 py-2.5 text-xs leading-relaxed text-text-muted">
      <ShieldCheck
        className="mt-px size-4 shrink-0 text-success"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span>{children}</span>
    </p>
  );
}

interface FlowProps {
  onProcessing: () => void;
  onSuccess: (cred: SDJWTCredential) => void;
  onError: (msg: string) => void;
}

// ─── Step: pick a source ──────────────────────────────────────────────────────

function SourceSelect({
  onSelect,
}: {
  onSelect: (s: CredentialSource) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SOURCES.map(({ source, category }) => {
        const meta = categoryMeta(category);
        return (
          <button
            key={source}
            type="button"
            onClick={() => onSelect(source)}
            className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5 text-left transition-colors duration-150 hover:border-border-strong hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: meta.color }}
              aria-hidden="true"
            />
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-lg border",
                meta.tint,
              )}
            >
              <meta.Icon
                className="size-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span>
              <span
                className={cn(
                  "block text-[11px] font-medium uppercase tracking-[0.08em]",
                  meta.text,
                )}
              >
                {meta.label}
              </span>
              <span className="mt-0.5 block font-display text-sm font-semibold text-foreground">
                {meta.issuerName}
              </span>
              <span className="mt-1 block text-xs text-text-muted">
                {predicatesFor(category).map(predicateLabel).join(" · ")}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Step: NADRA (CNIC → OTP) ─────────────────────────────────────────────────

function NadraFlow({ onProcessing, onSuccess, onError }: FlowProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const form = useForm<NadraFormData>();
  const otpForm = useForm<NadraOtpData>();

  async function submitForm(raw: NadraFormData) {
    const data = parseForm(nadraSchema, raw, form.setError);
    if (!data) return;
    try {
      const res = await apiFetch<{ session_id: string }>(
        `${API}/credentials/nadra/verify`,
        {
          method: "POST",
          body: JSON.stringify({ cnic: data.cnic, phone: data.phone }),
        },
      );
      setSessionId(res.session_id);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function submitOtp(raw: NadraOtpData) {
    const data = parseForm(nadraOtpSchema, raw, otpForm.setError);
    if (!data || !sessionId) return;
    onProcessing();
    try {
      const res = await apiFetch<{ credential: SDJWTCredential }>(
        `${API}/credentials/nadra/verify-otp`,
        {
          method: "POST",
          body: JSON.stringify({ session_id: sessionId, otp: data.otp }),
        },
      );
      onSuccess(res.credential);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  if (sessionId) {
    const err = otpForm.formState.errors.otp?.message;
    return (
      <form
        onSubmit={otpForm.handleSubmit(submitOtp)}
        noValidate
        className="grid gap-5"
      >
        <p className="text-sm text-text-muted">
          NADRA sent a 6-digit code to your registered mobile number.
        </p>
        <AuthField id="otp" label="Verification code" error={err}>
          <Input
            {...aria("otp", err)}
            {...masked(otpForm.register("otp"), (v) => digitsOnly(v, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            autoFocus
            className="h-12 text-center font-mono text-xl tracking-[0.4em]"
          />
        </AuthField>
        <SubmitButton
          busy={otpForm.formState.isSubmitting}
          busyLabel="Verifying…"
          label="Verify code"
        />
      </form>
    );
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <form
      onSubmit={form.handleSubmit(submitForm)}
      noValidate
      className="grid gap-5"
    >
      <AuthField id="cnic" label="CNIC" error={errors.cnic?.message}>
        <Input
          {...aria("cnic", errors.cnic?.message)}
          {...masked(form.register("cnic"), formatCnic)}
          inputMode="numeric"
          autoComplete="off"
          maxLength={15}
          placeholder="12345-1234567-1"
          className="font-mono"
        />
      </AuthField>
      <AuthField
        id="phone"
        label="Registered mobile number"
        error={errors.phone?.message}
      >
        <Input
          {...aria("phone", errors.phone?.message)}
          {...masked(form.register("phone"), formatPhone)}
          type="tel"
          inputMode="tel"
          maxLength={13}
          placeholder="03001234567"
          className="font-mono"
        />
      </AuthField>
      <Note>
        Your CNIC goes to NADRA only. The credential on your device confirms
        conditions like “Age over 18”.
      </Note>
      <SubmitButton
        busy={isSubmitting}
        busyLabel="Sending code…"
        label="Send verification code"
      />
    </form>
  );
}

// ─── Step: HEC ────────────────────────────────────────────────────────────────

function HECFlow({ onProcessing, onSuccess, onError }: FlowProps) {
  const { register, handleSubmit, setError, formState } =
    useForm<HecFormData>();
  const { errors, isSubmitting } = formState;

  async function onSubmit(raw: HecFormData) {
    const data = parseForm(hecSchema, raw, setError);
    if (!data) return;
    onProcessing();
    try {
      const res = await apiFetch<{ credential: SDJWTCredential }>(
        `${API}/credentials/hec/verify`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      onSuccess(res.credential);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <AuthField
        id="degree_number"
        label="Degree or roll number"
        error={errors.degree_number?.message}
      >
        <Input
          {...aria("degree_number", errors.degree_number?.message)}
          {...register("degree_number")}
          className="font-mono"
        />
      </AuthField>
      <AuthField
        id="university"
        label="University"
        error={errors.university?.message}
      >
        <Input
          {...aria("university", errors.university?.message)}
          {...register("university")}
          placeholder="Air University"
        />
      </AuthField>
      <AuthField
        id="student_name"
        label="Name on the degree"
        error={errors.student_name?.message}
      >
        <Input
          {...aria("student_name", errors.student_name?.message)}
          {...register("student_name")}
        />
      </AuthField>
      <SubmitButton
        busy={isSubmitting}
        busyLabel="Verifying…"
        label="Verify degree"
      />
    </form>
  );
}

// ─── Step: Air University ─────────────────────────────────────────────────────

function AirUniversityFlow({ onProcessing, onSuccess, onError }: FlowProps) {
  const { register, handleSubmit, setError, formState } = useForm<AUFormData>();
  const { errors, isSubmitting } = formState;

  async function onSubmit(raw: AUFormData) {
    const data = parseForm(auSchema, raw, setError);
    if (!data) return;
    onProcessing();
    try {
      const res = await apiFetch<{ credential: SDJWTCredential }>(
        `${API}/credentials/au/scrape`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      onSuccess(res.credential);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <AuthField
        id="username"
        label="Student portal username"
        error={errors.username?.message}
      >
        <Input
          {...aria("username", errors.username?.message)}
          {...register("username")}
          autoComplete="off"
        />
      </AuthField>
      <AuthField
        id="password"
        label="Student portal password"
        error={errors.password?.message}
      >
        <Input
          {...aria("password", errors.password?.message)}
          {...register("password")}
          type="password"
          autoComplete="new-password"
        />
      </AuthField>
      <Note>
        Used once to check your enrollment, then discarded. Never stored or
        logged.
      </Note>
      <SubmitButton
        busy={isSubmitting}
        busyLabel="Connecting…"
        label="Connect student portal"
      />
    </form>
  );
}

// ─── Step: LinkedIn (OAuth popup + poll) ──────────────────────────────────────

function LinkedInFlow({ onSuccess, onError }: Omit<FlowProps, "onProcessing">) {
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setPolling(false);
  }, []);
  useEffect(() => () => stopPolling(), [stopPolling]);

  async function startLinkedIn() {
    try {
      const res = await apiFetch<{ auth_url: string }>(
        `${API}/credentials/linkedin/auth-url`,
      );
      window.open(res.auth_url, "_blank", "width=600,height=700");
      setPolling(true);
      pollRef.current = setInterval(async () => {
        try {
          const status = await apiFetch<{
            status: string;
            credential?: SDJWTCredential;
          }>(`${API}/credentials/linkedin/status`);
          if (status.status === "completed" && status.credential) {
            stopPolling();
            onSuccess(status.credential);
          } else if (status.status === "failed") {
            stopPolling();
            onError(
              "LinkedIn didn't authorise NexusID. Try again and accept the request.",
            );
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
    <div className="grid gap-5">
      <p className="text-sm text-text-muted">
        LinkedIn opens in a new window. NexusID reads your current position once
        to confirm you are employed.
      </p>
      {polling ? (
        <div
          className="flex flex-col items-center gap-3 py-2 text-sm text-text-muted"
          aria-live="polite"
        >
          <Loader2
            className="size-5 animate-spin text-accent-text"
            aria-hidden="true"
          />
          Waiting for LinkedIn…
          <Button variant="ghost" size="sm" onClick={stopPolling}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button onClick={startLinkedIn} className="w-full">
          Continue with LinkedIn
        </Button>
      )}
      <Note>NexusID never sees your LinkedIn password.</Note>
    </div>
  );
}

// ─── Steps: processing / success / error ──────────────────────────────────────

function ProcessingStep({ source }: { source: CredentialSource }) {
  const meta = categoryMeta(CATEGORY_OF[source]);
  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-center"
      aria-live="polite"
    >
      <span
        className={cn(
          "flex size-16 items-center justify-center rounded-2xl border",
          meta.tint,
        )}
      >
        <meta.Icon
          className="size-8 animate-pulse"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </span>
      <div>
        <p className="font-display text-base font-semibold text-foreground">
          Verifying with {meta.issuerName}…
        </p>
        <p className="mt-1 text-sm text-text-muted">
          This usually takes a few seconds.
        </p>
      </div>
      <Loader2
        className="size-5 animate-spin text-text-muted"
        aria-hidden="true"
      />
    </div>
  );
}

function SuccessStep({
  credential,
  onDone,
}: {
  credential: SDJWTCredential;
  onDone: () => void;
}) {
  return (
    <div className="grid justify-items-center gap-5">
      <CredentialCard
        category={credential.type}
        status="valid"
        predicates={predicatesFor(credential.type)}
        credentialId={credential.id}
        expiresAt={credential.expires_at}
        className="animate-slide-up"
      />
      <p className="text-center text-sm text-text-muted">
        Signed by {categoryMeta(credential.type).issuerName} and stored
        encrypted in this browser.
      </p>
      <Button onClick={onDone} className="w-full">
        Done
      </Button>
    </div>
  );
}

function ErrorStep({
  message,
  onRetry,
  onChangeSource,
}: {
  message: string;
  onRetry: () => void;
  onChangeSource: () => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10 text-danger">
          <CircleX className="size-8" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p role="alert" className="text-sm leading-relaxed text-text-muted">
          {message}
        </p>
      </div>
      <div className="grid gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="ghost" onClick={onChangeSource}>
          Choose a different issuer
        </Button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AddCredentialModal({
  isOpen,
  onClose,
  onCredentialAdded,
}: AddCredentialModalProps) {
  const [step, setStep] = useState<Step>({ id: "preparing_key" });

  const prepareKey = useCallback(() => {
    setStep({ id: "preparing_key" });
    ensureWebKeypair()
      .then(() => setStep({ id: "source_select" }))
      .catch((err) =>
        setStep({ id: "key_error", message: (err as Error).message }),
      );
  }, []);

  // Make sure a device key exists before showing any issuer; reset after the close animation.
  useEffect(() => {
    if (isOpen) {
      prepareKey();
      return;
    }
    const t = setTimeout(() => setStep({ id: "preparing_key" }), 300);
    return () => clearTimeout(t);
  }, [isOpen, prepareKey]);

  async function handleSuccess(credential: SDJWTCredential) {
    // The backend keeps metadata only; the holder keeps the SD-JWT itself (encrypted, in this browser).
    try {
      await saveWebCredential(credential);
    } catch (err) {
      setStep({
        id: "error",
        source: "nadra",
        message: `The credential was issued but couldn't be stored in this browser: ${(err as Error).message}`,
      });
      return;
    }
    onCredentialAdded();
    setStep({ id: "success", credential });
  }

  const source = "source" in step ? step.source : null;
  const title =
    step.id === "success"
      ? "Credential added"
      : step.id === "error"
        ? "Couldn't add the credential"
        : source
          ? issuerName(source)
          : "Add a credential";
  const description =
    step.id === "source_select"
      ? "Pick the issuer. It signs a credential that only ever confirms conditions, never your raw data."
      : step.id === "auth_flow" && source
        ? `${categoryMeta(CATEGORY_OF[source]).label} credential`
        : undefined;
  const canGoBack = step.id === "auth_flow" || step.id === "error";

  const flow: FlowProps | null = source
    ? {
        onProcessing: () => setStep({ id: "processing", source }),
        onSuccess: handleSuccess,
        onError: (message) => setStep({ id: "error", message, source }),
      }
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 size-8 text-text-muted hover:text-foreground"
                onClick={() => setStep({ id: "source_select" })}
                aria-label="Back to issuers"
              >
                <ArrowLeft className="size-4" strokeWidth={1.75} />
              </Button>
            )}
            <DialogTitle className="font-display text-lg font-semibold">
              {title}
            </DialogTitle>
          </div>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>

        <div className="pt-2">
          {step.id === "preparing_key" && (
            <div
              className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-text-muted"
              aria-live="polite"
            >
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              Securing this browser&apos;s signing key…
            </div>
          )}
          {step.id === "key_error" && (
            <div className="grid gap-4">
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {step.message}
              </p>
              <Button onClick={prepareKey}>Try again</Button>
            </div>
          )}
          {step.id === "source_select" && (
            <SourceSelect
              onSelect={(s) => setStep({ id: "auth_flow", source: s })}
            />
          )}
          {step.id === "auth_flow" && flow && step.source === "nadra" && (
            <NadraFlow {...flow} />
          )}
          {step.id === "auth_flow" && flow && step.source === "hec" && (
            <HECFlow {...flow} />
          )}
          {step.id === "auth_flow" &&
            flow &&
            step.source === "air-university" && <AirUniversityFlow {...flow} />}
          {step.id === "auth_flow" && flow && step.source === "linkedin" && (
            <LinkedInFlow {...flow} />
          )}
          {step.id === "processing" && <ProcessingStep source={step.source} />}
          {step.id === "success" && (
            <SuccessStep credential={step.credential} onDone={onClose} />
          )}
          {step.id === "error" && (
            <ErrorStep
              message={step.message}
              onRetry={() => setStep({ id: "auth_flow", source: step.source })}
              onChangeSource={() => setStep({ id: "source_select" })}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
