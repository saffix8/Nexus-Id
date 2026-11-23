"use client";

// Service Provider registration (SRS UC-008, FR-033). On success the first
// API key (FR-034) is shown exactly once — it is stored only as a hash.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";

const providerSchema = z.object({
  displayName: z.string().min(1, "Organisation name is required"),
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a domain like example.com"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type ProviderForm = z.infer<typeof providerSchema>;

const FIELDS: {
  name: keyof ProviderForm;
  label: string;
  type: string;
  placeholder: string;
  autoComplete: string;
}[] = [
  {
    name: "displayName",
    label: "Organisation name",
    type: "text",
    placeholder: "Acme Hiring",
    autoComplete: "organization",
  },
  {
    name: "domain",
    label: "Website domain",
    type: "text",
    placeholder: "acme.com",
    autoComplete: "url",
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    placeholder: "you@acme.com",
    autoComplete: "email",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "••••••••",
    autoComplete: "new-password",
  },
];

export default function ProviderRegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProviderForm>();

  const onSubmit = async (data: ProviderForm) => {
    setServerError(null);

    const parsed = providerSchema.safeParse(data);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        setError(issue.path[0] as keyof ProviderForm, {
          message: issue.message,
        });
      });
      return;
    }

    try {
      const res = await fetch("/api/auth?action=verifier-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = (await res.json()) as {
        success: boolean;
        apiKey?: string;
        error?: string;
      };

      if (!res.ok || !json.success || !json.apiKey) {
        setServerError(json.error ?? "Registration failed");
        return;
      }
      setApiKey(json.apiKey);
    } catch {
      setServerError("Unable to reach the server. Please try again.");
    }
  };

  async function copyKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
  }

  return (
    <div className="min-h-screen bg-[#0C0E13] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {apiKey ? (
            <>
              <h1 className="font-display font-semibold text-2xl text-[#EEF0F6] tracking-tight mb-1">
                Your API key
              </h1>
              <p className="text-sm text-[#8B92A8] mb-6">
                Copy it now and keep it on your server. It won&apos;t be shown
                again — you can generate a new one from API Keys at any time.
              </p>
              <div
                className="rounded-md border border-[#252C3D] bg-[#0A0C10] px-3 py-3 text-sm text-[#EEF0F6] break-all"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {apiKey}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={copyKey}
                  className="flex-1 h-10 rounded-md border border-[#252C3D] text-sm text-[#EEF0F6] hover:bg-[#1A1E28] transition-colors"
                >
                  {copied ? "Copied" : "Copy key"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    router.push("/verifier/dashboard");
                    router.refresh();
                  }}
                  className="flex-1 h-10 rounded-md bg-gradient-to-r from-[#3B6FE8] to-[#5B4FE8] text-white text-sm font-medium hover:opacity-90"
                >
                  Continue to portal
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display font-semibold text-2xl text-[#EEF0F6] tracking-tight mb-1">
                Register your organisation
              </h1>
              <p className="text-sm text-[#8B92A8] mb-8">
                Verify your users&apos; claims without collecting their
                documents.
              </p>

              {serverError && (
                <div className="mb-6 px-4 py-3 rounded-lg bg-[#250F0F] border border-[#4A1515] text-sm text-[#EF4444]">
                  {serverError}
                </div>
              )}

              <form
                method="post"
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="space-y-5"
              >
                {FIELDS.map((f) => (
                  <div key={f.name} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={f.name}
                      className="text-sm font-medium text-[#8B92A8] tracking-wide"
                    >
                      {f.label}
                    </label>
                    <input
                      id={f.name}
                      type={f.type}
                      placeholder={f.placeholder}
                      autoComplete={f.autoComplete}
                      className={`bg-[#0A0C10] border rounded-md px-3 py-2.5 text-base text-[#EEF0F6] placeholder:text-[#525A72] outline-none transition-all ${
                        errors[f.name]
                          ? "border-[#EF4444]"
                          : "border-[#252C3D] focus:border-[#3B6FE8]"
                      }`}
                      {...register(f.name)}
                    />
                    {errors[f.name] && (
                      <p className="text-xs text-[#EF4444]">
                        {errors[f.name]?.message}
                      </p>
                    )}
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 mt-2 rounded-md bg-gradient-to-r from-[#3B6FE8] to-[#5B4FE8] text-white font-medium text-base hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting
                    ? "Creating account…"
                    : "Create provider account"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-[#8B92A8]">
                Already registered?{" "}
                <Link
                  href="/auth/login?role=provider"
                  className="text-[#3B6FE8] hover:text-[#4A7EF7] font-medium"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
