"use client";

// SCR-017 — Service Provider sign-in (FR-039). Posts to /api/auth?action=verifier-login
// (API-049's provider branch), which sets the provider session cookie.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthField, AuthFrame } from "@/components/nexus/AuthFrame";
import { parseForm } from "@/lib/forms";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
type Form = z.infer<typeof schema>;

/** Only portal paths are allowed as a post-login destination. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/verifier") && !next.startsWith("//")
    ? next
    : "/verifier/dashboard";
}

function ProviderLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  async function onSubmit(raw: Form) {
    setServerError(null);
    const data = parseForm(schema, raw, setError);
    if (!data) return;
    try {
      const res = await fetch("/api/auth?action=verifier-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        setServerError(json.error ?? "Invalid email or password");
        return;
      }
      router.push(safeNext(params.get("next")));
      router.refresh();
    } catch {
      setServerError(
        "Can't reach the NexusID server. Check that the backend is running.",
      );
    }
  }

  return (
    <AuthFrame
      title="Service Provider sign-in"
      description="Your verification log, conditions and API keys."
      footer={
        <>
          New to NexusID?{" "}
          <Link
            href="/auth/provider-register"
            className="font-medium text-accent-text hover:underline"
          >
            Register your platform
          </Link>
          <span className="mx-2 text-border-strong">·</span>
          <Link href="/login" className="hover:text-foreground">
            Not a provider?
          </Link>
        </>
      }
    >
      <form
        method="post"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="grid gap-5"
      >
        {serverError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger"
          >
            <CircleAlert
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {serverError}
          </p>
        )}
        <AuthField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        </AuthField>
        <AuthField
          id="password"
          label="Password"
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
        </AuthField>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthFrame>
  );
}

// useSearchParams needs a Suspense boundary for static rendering.
export default function ProviderLoginPage() {
  return (
    <Suspense>
      <ProviderLoginForm />
    </Suspense>
  );
}
