"use client";

// End User email + password sign-in — fallback for SCR-013 QR sign-in (/auth/login),
// e.g. before the phone app is signed in, or after losing the phone.
// Service Providers sign in at /auth/provider-login (SCR-017).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CircleAlert, Loader2, Smartphone } from "lucide-react";
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

/** Only End User portal paths are allowed as a post-login destination. */
function safeNext(next: string | string[] | undefined): string | null {
  return typeof next === "string" &&
    next.startsWith("/dashboard") &&
    !next.startsWith("//")
    ? next
    : null;
}

export default function PasswordLoginPage({
  searchParams,
}: {
  searchParams: { next?: string | string[] };
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const next = safeNext(searchParams.next);
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
      const res = await fetch("/api/auth?action=login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        setServerError(json.error ?? "Invalid email or password");
        return;
      }
      router.push(next ?? "/dashboard");
      router.refresh();
    } catch {
      setServerError(
        "Can't reach the NexusID server. Check that the backend is running.",
      );
    }
  }

  return (
    <AuthFrame
      title="Sign in with email"
      description="Your identity wallet: credentials, requests and history."
      footer={
        <>
          No account yet?{" "}
          <Link
            href="/auth/register"
            className="font-medium text-accent-text hover:underline"
          >
            Create one
          </Link>
          <span className="mx-2 text-border-strong">·</span>
          <Link href="/auth/provider-login" className="hover:text-foreground">
            Service Provider?
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
            placeholder="you@example.com"
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
        <Button asChild variant="outline" className="w-full">
          <Link
            href={`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          >
            <Smartphone
              className="size-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Sign in with your phone instead
          </Link>
        </Button>
      </form>
    </AuthFrame>
  );
}
