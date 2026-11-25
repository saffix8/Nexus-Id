// apps/web/lib/userApi.ts
//
// End User portal data (SRS FR-028–FR-030, FR-038). Every call goes through
// the Next proxy routes, which add the End User session cookie as a Bearer token:
//   /api/v1/pairings/*      → API-026 list, API-027 revoke
//   /api/v1/verification/*  → API-038 history, API-039 delete one, API-040 clear
//   /api/v1/credentials     → credential count for the KPI row

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VerificationOutcome } from "@nexusid/types";

/** API-026 */
export interface Pairing {
  pairingId: string;
  status: "paired" | "revoked";
  /** "Chrome on Linux"; null for pairings made before labels were recorded. */
  browser?: string | null;
  pairedAt: string | null;
  revokedAt: string | null;
}

/** API-038 — outcome and condition only, never a claim value (FR-028 AC3, BR-015). */
export interface HistoryEntry {
  requestId: string;
  verifierId: string;
  verifierName: string;
  predicate: string;
  predicateLabel: string;
  outcome: VerificationOutcome;
  issuer: string | null;
  decidedAt: string | null;
  created_at: string;
}

interface CredentialSummary {
  status: string;
}

export const PAIRINGS_KEY = ["pairings"] as const;
export const HISTORY_KEY = ["history"] as const;
const CREDENTIALS_KEY = ["credentials", "summary"] as const;

type Envelope<T> = { success: boolean; data?: T; error?: string };

async function call<T>(
  url: string,
  init?: RequestInit,
  fallback = "Request failed",
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...init,
    });
  } catch {
    throw new Error(
      "Unable to reach NexusID. Check your connection and try again.",
    );
  }
  let json: Envelope<T>;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    throw new Error(`${fallback} (HTTP ${res.status})`);
  }
  if (!res.ok || !json.success) throw new Error(json.error ?? fallback);
  return json.data as T;
}

// ── Pairings (FR-038) ────────────────────────────────────────────────────────

export function usePairings() {
  return useQuery({
    queryKey: PAIRINGS_KEY,
    queryFn: () =>
      call<Pairing[]>(
        "/api/v1/pairings",
        undefined,
        "Couldn't load your paired browsers",
      ),
    staleTime: 10_000,
  });
}

/** API-027 — requests from that browser stop reaching this account (FR-038 AC2). */
export function useRevokePairing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pairingId: string) =>
      call<null>(
        `/api/v1/pairings/${pairingId}`,
        { method: "DELETE" },
        "Couldn't revoke this browser",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAIRINGS_KEY }),
  });
}

// ── History (FR-028–FR-030) ──────────────────────────────────────────────────

export function useHistory(limit = 100) {
  return useQuery({
    queryKey: [...HISTORY_KEY, limit],
    queryFn: () =>
      call<HistoryEntry[]>(
        `/api/v1/verification/history?limit=${limit}`,
        undefined,
        "Couldn't load your history",
      ),
    staleTime: 5_000,
  });
}

/** API-039 — hides one entry here and on the phone; the SP log keeps it (BR-023). */
export function useDeleteHistoryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      call<{ deleted: number }>(
        `/api/v1/verification/history/${requestId}`,
        { method: "DELETE" },
        "Couldn't delete this entry",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: HISTORY_KEY }),
  });
}

/** API-040 — clear everything (FR-030 AC3: the caller confirms first). */
export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call<{ deleted: number }>(
        "/api/v1/verification/history",
        { method: "DELETE" },
        "Couldn't clear your history",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: HISTORY_KEY }),
  });
}

// ── Credentials (KPI only) ───────────────────────────────────────────────────

export function useActiveCredentialCount() {
  return useQuery({
    queryKey: CREDENTIALS_KEY,
    queryFn: async () => {
      const creds = await call<CredentialSummary[]>(
        "/api/v1/credentials",
        undefined,
        "Couldn't load credentials",
      );
      return creds.filter((c) => c.status === "active").length;
    },
  });
}

// ── Account (SCR-014 "Your phone" row) ───────────────────────────────────────

export interface Me {
  id: string;
  email: string | null;
  name: string | null;
  /** Registered device key (FR-002); null until a phone or this browser registers one. */
  publicKey: string | null;
  /** Phone model from the app's registration, if it sent one. */
  deviceName: string | null;
  createdAt: string;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => call<Me>("/api/v1/users/me", undefined, "Couldn't load your account"),
  });
}
