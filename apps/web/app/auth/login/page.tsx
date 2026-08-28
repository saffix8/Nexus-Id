'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ─── Schema ───────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name is too long'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

// ─── Field component ─────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  registration: ReturnType<ReturnType<typeof useForm<RegisterForm>>['register']>;
}

function Field({ id, label, type = 'text', placeholder, autoComplete, error, registration }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[#8B92A8] tracking-wide">
        {label}
      </label>
      <div className={`
        flex items-center bg-[#0A0C10] border rounded-md transition-all duration-150
        ${error
          ? 'border-[#EF4444] shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
          : 'border-[#252C3D] focus-within:border-[#3B6FE8] focus-within:shadow-[0_0_0_3px_rgba(59,111,232,0.12)]'
        }
      `}>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-3 py-2.5 text-base text-[#EEF0F6] placeholder:text-[#525A72] outline-none"
          {...registration}
        />
      </div>
      {error && <p className="text-xs text-[#EF4444]">{error}</p>}
    </div>
  );
}

// ─── Password strength indicator ──────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  const colors = ['#EF4444', '#F59E0B', '#F59E0B', '#22C55E', '#22C55E'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < score ? colors[score] : '#1E2330',
            }}
          />
        ))}
      </div>
      <span className="text-xs font-mono" style={{ color: score > 0 ? colors[score] : '#525A72' }}>
        {labels[score]}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });

  const passwordValue = watch('password', '');

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null);

    try {
      const res = await fetch('/api/auth?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setServerError(json.error ?? 'Registration failed. Please try again.');
        return;
      }

      // If server set cookie, go straight to dashboard
      if (json.autoLogin) {
        router.push('/dashboard');
        router.refresh();
      } else {
        router.push('/auth/login?registered=true');
      }
    } catch {
      setServerError('Unable to reach the server. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0E13] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3B6FE8] to-[#5B4FE8] flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
              <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 6L10 7.5V10L8 11.5L6 10V7.5L8 6Z" fill="white" />
            </svg>
          </div>
          <span className="font-display font-semibold text-xl text-[#EEF0F6] tracking-tight">
            NexusID
          </span>
        </div>

        {/* Card */}
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">

          {/* Heading */}
          <div className="mb-8">
            <h1 className="font-display font-semibold text-2xl text-[#EEF0F6] tracking-tight mb-1">
              Create account
            </h1>
            <p className="text-sm text-[#8B92A8]">
              Your privacy-preserving identity wallet
            </p>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-[#250F0F] border border-[#4A1515] text-sm text-[#EF4444]">
              {serverError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

            <Field
              id="name"
              label="Full name"
              placeholder="Ahmed Khan"
              autoComplete="name"
              error={errors.name?.message}
              registration={register('name')}
            />

            <Field
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              registration={register('email')}
            />

            {/* Password with strength indicator */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-[#8B92A8] tracking-wide">
                Password
              </label>
              <div className={`
                flex items-center bg-[#0A0C10] border rounded-md transition-all duration-150
                ${errors.password
                  ? 'border-[#EF4444] shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
                  : 'border-[#252C3D] focus-within:border-[#3B6FE8] focus-within:shadow-[0_0_0_3px_rgba(59,111,232,0.12)]'
                }
              `}>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  className="flex-1 bg-transparent px-3 py-2.5 text-base text-[#EEF0F6] placeholder:text-[#525A72] outline-none"
                  {...register('password')}
                />
              </div>
              <PasswordStrength password={passwordValue} />
              {errors.password && (
                <p className="text-xs text-[#EF4444]">{errors.password.message}</p>
              )}
            </div>

            <Field
              id="confirmPassword"
              label="Confirm password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              registration={register('confirmPassword')}
            />

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="
                w-full h-11 mt-2 rounded-md
                bg-gradient-to-r from-[#3B6FE8] to-[#5B4FE8]
                text-white font-medium text-base
                transition-opacity duration-150
                hover:opacity-90 active:opacity-80
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2
                shadow-[0_0_0_1px_rgba(59,111,232,0.4),0_0_24px_rgba(59,111,232,0.1)]
              "
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Terms note */}
          <p className="mt-5 text-xs text-[#525A72] text-center leading-relaxed">
            By creating an account you agree that your credentials are stored
            encrypted on your device only.
          </p>

          {/* Divider */}
          <div className="my-5 flex items-center gap-4">
            <div className="flex-1 h-px bg-[#1E2330]" />
            <span className="text-xs text-[#525A72]">OR</span>
            <div className="flex-1 h-px bg-[#1E2330]" />
          </div>

          {/* Login link */}
          <p className="text-center text-sm text-[#8B92A8]">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="text-[#3B6FE8] hover:text-[#4A7EF7] font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
