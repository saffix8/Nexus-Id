// apps/web/lib/verifierApi.ts
//
// Service Provider portal data (SRS FR-033, FR-034, UC-010) — all calls go
// through /api/v1/verifiers, which uses the provider session cookie.

import { useQuery } from "@tanstack/react-query";

export interface VerifierProfile {
  id: string;
  displayName: string;
  domain: string;
  email: string | null;
  apiKeyPrefix: string | null;
  apiKeyRotatedAt: string | null;
  createdAt: string;
}

export interface IssuedApiKey {
  apiKey: string;
  apiKeyPrefix: string;
  apiKeyRotatedAt: string;
}

export type RequestStatus = "pending" | "completed" | "rejected" | "expired";

export interface VerifierRequestRow {
  id: string;
  requestedFields: string[];
  status: RequestStatus;
  responseTimeSec: number | null;
  createdAt: string;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/verifiers${path}`, {
    credentials: "include",
    ...init,
  });
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || !json.success || json.data === undefined) {
    throw new Error(json.error ?? `Request failed (HTTP ${res.status})`);
  }
  return json.data;
}

export const fetchVerifierProfile = () => call<VerifierProfile>("/me");

/** UC-009 — generate a new key; the previous one stops working immediately. */
export const rotateApiKey = () =>
  call<IssuedApiKey>("/me/api-key", { method: "POST" });

export function fetchVerifierRequests(
  from: Date,
  to: Date,
): Promise<VerifierRequestRow[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return call<VerifierRequestRow[]>(`/me/requests?${params}`);
}

export const VERIFIER_PROFILE_KEY = ["verifier-profile"] as const;

export function useVerifierProfile() {
  return useQuery({
    queryKey: VERIFIER_PROFILE_KEY,
    queryFn: fetchVerifierProfile,
  });
}

/** Field key → credential category, for grouping analytics. */
export const FIELD_CATEGORY: Record<
  string,
  "identity" | "education" | "employment" | "enrollment"
> = {
  full_name: "identity",
  cnic: "identity",
  age: "identity",
  age_over_18: "identity",
  gender: "identity",
  degree_title: "education",
  university: "education",
  year_of_award: "education",
  registration_number: "education",
  student_name: "education",
  current_company: "employment",
  current_title: "employment",
  employment_status: "employment",
  experience_years: "employment",
  program: "enrollment",
  enrollment_status: "enrollment",
  department: "enrollment",
  cgpa: "enrollment",
};
