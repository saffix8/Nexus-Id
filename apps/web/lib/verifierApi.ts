// apps/web/lib/verifierApi.ts
//
// Service Provider portal data (SRS FR-039–FR-042). Every call goes through
// the Next proxy routes, which add the provider session cookie as a Bearer token:
//   /api/v1/verifiers/*  → profile, API-043/044 key, API-045/046 requirements
//   /api/v1/analytics/*  → API-047 totals, API-048 log

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PredicateCode, VerificationOutcome } from "@nexusid/types";

export interface VerifierProfile {
  id: string;
  displayName: string;
  domain: string;
  email: string | null;
  apiKeyPrefix: string | null;
  apiKeyRotatedAt: string | null;
  createdAt: string;
}

/** API-043 — key data only; the key itself is stored as a hash. */
export interface ApiKeyInfo {
  apiKeyPrefix: string | null;
  apiKeyRotatedAt: string | null;
  createdAt: string;
}

/** API-044 — the plaintext key is in this response and nowhere else, ever. */
export interface IssuedApiKey {
  apiKey: string;
  apiKeyPrefix: string;
  apiKeyRotatedAt: string;
}

/** API-047 */
export interface VerificationStats {
  total: number;
  verified: number;
  failed: number;
  declined: number;
  expired: number;
  pending: number;
  successRate: number | null;
  daily: {
    date: string;
    verified: number;
    failed: number;
    declined: number;
    expired: number;
  }[];
}

/** API-048 — no End User data (BR-015, FR-042 AC2). */
export interface RecentVerification {
  id: string;
  sessionId: string;
  createdAt: string;
  predicate: string;
  predicateLabel: string;
  outcome: VerificationOutcome;
  issuer: string | null;
  proofHash: string | null;
  decidedAt: string | null;
}

/** API-045/046 */
export interface VerifierRequirements {
  predicates: PredicateCode[];
  catalog: { code: string; category: string; label: string; issuer: string }[];
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** DESIGN.md §7: loading over 8 s becomes an error with Retry. */
const TIMEOUT_MS = 8000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      credentials: "include",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiError(
      timedOut
        ? "The NexusID server took too long to answer."
        : "Can't reach the NexusID server. Check that the backend is running.",
      timedOut ? 408 : 0,
    );
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // Non-JSON (proxy crash, backend down behind the proxy).
  }
  if (!res.ok || !json?.success || json.data === undefined) {
    const message =
      res.status === 401
        ? "Your session has ended. Sign in again."
        : (json?.error ?? `Request failed (HTTP ${res.status})`);
    throw new ApiError(message, res.status);
  }
  return json.data;
}

// ── Fetchers ────────────────────────────────────────────────────────────────

export const fetchVerifierProfile = () =>
  call<VerifierProfile>("/verifiers/me");
export const fetchApiKeyInfo = () => call<ApiKeyInfo>("/verifiers/api-key");
export const regenerateApiKey = () =>
  call<IssuedApiKey>("/verifiers/api-key/regenerate", { method: "POST" });
export const fetchRequirements = () =>
  call<VerifierRequirements>("/verifiers/requirements");
export const saveRequirements = (predicates: PredicateCode[]) =>
  call<VerifierRequirements>("/verifiers/requirements", {
    method: "PUT",
    body: JSON.stringify({ predicates }),
  });

export const fetchStats = () =>
  call<VerificationStats>(
    `/analytics/verifications?tzOffset=${new Date().getTimezoneOffset()}`,
  );
export const fetchRecent = (limit = 20) =>
  call<RecentVerification[]>(`/analytics/recent?limit=${limit}`);

// ── Hooks ───────────────────────────────────────────────────────────────────

/** Demo: a new row should appear within ~3 s of the user approving (DESIGN.md §1.4). */
export const LIVE_INTERVAL_MS = 3000;

export const verifierKeys = {
  profile: ["verifier", "profile"] as const,
  apiKey: ["verifier", "api-key"] as const,
  requirements: ["verifier", "requirements"] as const,
  stats: ["verifier", "stats"] as const,
  recent: ["verifier", "recent"] as const,
};

/** Kept for existing imports. */
export const VERIFIER_PROFILE_KEY = verifierKeys.profile;

/** Retry a blip once; never auth failures or timeouts (§7: over 8 s → error with Retry). */
const noRetryOnAuth = (count: number, err: Error) =>
  !(err instanceof ApiError && [401, 403, 408].includes(err.status)) && count < 1;

export function useVerifierProfile() {
  return useQuery({
    queryKey: verifierKeys.profile,
    queryFn: fetchVerifierProfile,
    retry: noRetryOnAuth,
  });
}

export function useApiKeyInfo() {
  return useQuery({
    queryKey: verifierKeys.apiKey,
    queryFn: fetchApiKeyInfo,
    retry: noRetryOnAuth,
  });
}

export function useRequirements() {
  return useQuery({
    queryKey: verifierKeys.requirements,
    queryFn: fetchRequirements,
    retry: noRetryOnAuth,
  });
}

export function useVerificationStats() {
  return useQuery({
    queryKey: verifierKeys.stats,
    queryFn: fetchStats,
    refetchInterval: LIVE_INTERVAL_MS,
    staleTime: 0,
    retry: noRetryOnAuth,
  });
}

export function useRecentVerifications(limit = 20) {
  return useQuery({
    queryKey: [...verifierKeys.recent, limit],
    queryFn: () => fetchRecent(limit),
    refetchInterval: LIVE_INTERVAL_MS,
    staleTime: 0,
    retry: noRetryOnAuth,
  });
}

export function useSaveRequirements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveRequirements,
    onSuccess: (data) => qc.setQueryData(verifierKeys.requirements, data),
  });
}

export function useRegenerateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: regenerateApiKey,
    onSuccess: (issued) => {
      // Cache key data only — the plaintext key stays in the component that shows it once.
      qc.setQueryData<ApiKeyInfo>(verifierKeys.apiKey, (old) => ({
        apiKeyPrefix: issued.apiKeyPrefix,
        apiKeyRotatedAt: issued.apiKeyRotatedAt,
        createdAt: old?.createdAt ?? issued.apiKeyRotatedAt,
      }));
      void qc.invalidateQueries({ queryKey: verifierKeys.profile });
    },
  });
}

/** Field key → credential category. Legacy, still used by the End User history page (Phase 7). */
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
