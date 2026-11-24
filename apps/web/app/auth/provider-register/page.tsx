"use client";

// SCR-017 — Service Provider registration (FR-039, BR-008). Posts to
// /api/auth?action=verifier-register, which creates the account, signs the
// provider in and returns the first API key. The key is shown here once
// (FR-040 AC1) and never stored by the web app.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiKeyReveal } from "@/components/nexus/ApiKeyReveal";
import { AuthField, AuthFrame } from "@/components/nexus/AuthFrame";
import { parseForm } from "@/lib/forms";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Platform name is required")
    .max(120, "Keep it under 120 characters"),
  domain: z
    .string()
    .trim()
    .min(1, "Website domain is required")
    .transform((d) =>
      d
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .toLowerCase(),
    )
    .pipe(
      z
        .string()
        .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like shop-a.com"),
    ),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});
type Form = z.input<typeof schema>;

const FIELDS: {
  name: keyof Form;
  label: string;
  type: string;
  placeholder?: string;
  autoComplete: string;
}[] = [
  {
    name: "displayName",
    label: "Platform name",
    type: "text",
    placeholder: "Shop A",
    autoComplete: "organization",
  },
  {
    name: "domain",
    label: "Website domain",
    type: "text",
    placeholder: "shop-a.com",
    autoComplete: "url",
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    placeholder: "you@shop-a.com",
    autoComplete: "email",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "new-password",
  },
];

export default function ProviderRegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
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
      const res = await fetch("/api/auth?action=verifier-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as {
        success: boolean;
        apiKey?: string;
        error?: string;
      };
      if (!res.ok || !json.success || !json.apiKey) {
        const message = json.error ?? "Registration failed";
        // FR-039 AC2: say which field is taken, inline.
        if (/email/i.test(message) && res.status === 409)
          setError("email", { message });
        else if (/domain/i.test(message) && res.status === 409)
          setError("domain", { message });
        else setServerError(message);
        return;
      }
      setApiKey(json.apiKey);
    } catch {
      setServerError(
        "Can't reach the NexusID server. Check that the backend is running.",
      );
    }
  }

  if (apiKey) {
    return (
      <AuthFrame
        title="Your platform is ready"
        description="Here is your first API key. Copy it now."
      >
        <div className="grid gap-5">
          <ApiKeyReveal apiKey={apiKey} />
          <Button
            className="w-full"
            onClick={() => {
              setApiKey(null);
              router.push("/verifier/requirements");
              router.refresh();
            }}
          >
            I&apos;ve stored it, choose what to verify
            <ArrowRight
              className="size-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Register your platform"
      description="Verify conditions like age or enrollment without collecting personal data."
      footer={
        <>
          Already registered?{" "}
          <Link
            href="/auth/provider-login"
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
        {FIELDS.map((f) => {
          const err = errors[f.name]?.message;
          return (
            <AuthField key={f.name} id={f.name} label={f.label} error={err}>
              <Input
                id={f.name}
                type={f.type}
                autoComplete={f.autoComplete}
                placeholder={f.placeholder}
                aria-invalid={!!err}
                aria-describedby={err ? `${f.name}-error` : undefined}
                {...register(f.name)}
              />
            </AuthField>
          );
        })}
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
