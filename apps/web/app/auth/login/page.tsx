'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);

    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof LoginForm;
        setError(field, { message: issue.message });
      });
      return;
    }

    try {
      const res = await fetch('/api/auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setServerError(json.error ?? 'Invalid email or password');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setServerError('Unable to reach the server. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0E13] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
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

        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <div className="mb-8">
            <h1 className="font-display font-semibold text-2xl text-[#EEF0F6] tracking-tight mb-1">
              Welcome back
            </h1>
            <p className="text-sm text-[#8B92A8]">
              Sign in to your identity wallet
            </p>
          </div>

          {serverError && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-[#250F0F] border border-[#4A1515] text-sm text-[#EF4444]">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-[#8B92A8] tracking-wide">
                Email
              </label>
              <div className={`flex items-center bg-[#0A0C10] border rounded-md transition-all duration-150 ${
                errors.email ? 'border-[#EF4444] shadow-[0_0_0_3px_rgba(239,68,68,0.12)]' : 'border-[#252C3D] focus-within:border-[#3B6FE8] focus-within:shadow-[0_0_0_3px_rgba(59,111,232,0.12)]'
              }`}>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="flex-1 bg-transparent px-3 py-2.5 text-base text-[#EEF0F6] placeholder:text-[#525A72] outline-none"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-xs text-[#EF4444]">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-[#8B92A8] tracking-wide">
                  Password
                </label>
              </div>
              <div className={`flex items-center bg-[#0A0C10] border rounded-md transition-all duration-150 ${
                errors.password ? 'border-[#EF4444] shadow-[0_0_0_3px_rgba(239,68,68,0.12)]' : 'border-[#252C3D] focus-within:border-[#3B6FE8] focus-within:shadow-[0_0_0_3px_rgba(59,111,232,0.12)]'
              }`}>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="flex-1 bg-transparent px-3 py-2.5 text-base text-[#EEF0F6] placeholder:text-[#525A72] outline-none"
                  {...register('password')}
                />
              </div>
              {errors.password && <p className="text-xs text-[#EF4444]">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 mt-2 rounded-md bg-gradient-to-r from-[#3B6FE8] to-[#5B4FE8] text-white font-medium text-base transition-opacity duration-150 hover:opacity-90 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_0_1px_rgba(59,111,232,0.4),0_0_24px_rgba(59,111,232,0.1)]"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-[#1E2330]" />
            <span className="text-xs text-[#525A72]">OR</span>
            <div className="flex-1 h-px bg-[#1E2330]" />
          </div>

          <p className="text-center text-sm text-[#8B92A8]">
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" className="text-[#3B6FE8] hover:text-[#4A7EF7] font-medium transition-colors">
              Create one
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[#525A72]">
          Your credentials are encrypted and never leave your device.
        </p>
      </div>
    </div>
  );
}