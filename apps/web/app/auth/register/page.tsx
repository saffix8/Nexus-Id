"use client";

// End User registration (FR-001, API-050 → backend API-017). The phone app is the main way in;
// this web form exists for the portal fallback.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthField, AuthFrame } from "@/components/nexus/AuthFrame";
import { parseForm } from "@/lib/forms";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name is too long"),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .regex(/[A-Z]/, "Add at least one uppercase letter")
      .regex(/[0-9]/, "Add at least one number"),
    confirmPassword: z.string().min(1, "Repeat your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type Form = z.infer<typeof schema>;

const STRENGTH = [
  { label: "", bar: "bg-border-subtle", text: "text-text-muted" },
  { label: "Weak", bar: "bg-danger", text: "text-danger" },
  { label: "Fair", bar: "bg-warning", text: "text-warning" },
  { label: "Good", bar: "bg-success", text: "text-success" },
  { label: "Strong", bar: "bg-success", text: "text-success" },
];

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const s = STRENGTH[score];
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-150",
              i < score ? s.bar : "bg-border-subtle",
            )}
          />
        ))}
      </div>
      <span className={cn("w-12 text-right text-xs", s.text)}>
        {s.label && `${s.label}`}
      </span>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ mode: "onTouched" });
  const password = watch("password", "");

  async function onSubmit(raw: Form) {
    setServerError(null);
    const data = parseForm(schema, raw, setError);
    if (!data) return;
    try {
      const res = await fetch("/api/auth?action=register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        autoLogin?: boolean;
      };
      if (!res.ok || !json.success) {
        setServerError(
          json.error ??
            "Couldn't create the account. Check the details and try again.",
        );
        return;
      }
      if (json.autoLogin) {
        router.push("/dashboard");
        router.refresh();
      } else {
        router.push("/auth/login/password");
      }
    } catch {
      setServerError(
        "Can't reach the NexusID server. Check that the backend is running.",
      );
    }
  }

  const field = (id: keyof Form) => ({
    id,
    "aria-invalid": !!errors[id],
    "aria-describedby": errors[id] ? `${id}-error` : undefined,
    ...register(id),
  });

  return (
    <AuthFrame
      title="Create your wallet"
      description="Credentials stay encrypted on your device. Only answers are ever shared."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-medium text-accent-text hover:underline"
          >
            Sign in
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
        <AuthField id="name" label="Full name" error={errors.name?.message}>
          <Input
            autoComplete="name"
            placeholder="Ayesha Khan"
            {...field("name")}
          />
        </AuthField>
        <AuthField id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...field("email")}
          />
        </AuthField>
        <AuthField
          id="password"
          label="Password"
          error={errors.password?.message}
        >
          <Input
            type="password"
            autoComplete="new-password"
            {...field("password")}
          />
          <PasswordStrength password={password} />
        </AuthField>
        <AuthField
          id="confirmPassword"
          label="Repeat password"
          error={errors.confirmPassword?.message}
        >
          <Input
            type="password"
            autoComplete="new-password"
            {...field("confirmPassword")}
          />
        </AuthField>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthFrame>
  );
}
