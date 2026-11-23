"use client";

// Incoming verification requests — web stand-in for the mobile approval
// screen (SRS UC-004, MOD-4, MOD-5). Requests reach this account through the
// extension's device pairing (FR-003). On approval this browser builds the
// SD-JWT presentation + key-binding JWT locally (lib/webHolder.ts) with the
// web keypair, and only the requested disclosures leave the browser.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SDJWTCredential } from "@nexusid/types";
import { listWebCredentials } from "@/lib/webWallet";
import { getWebSigningKey } from "@/lib/webKeypair";
import {
  decodeDisclosure,
  disclosableFields,
  generateProof,
} from "@/lib/webHolder";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingRequest {
  requestId: string;
  verifierId: string;
  verifierName: string;
  verifierDomain: string | null;
  requestedFields: string[];
  nonce: string;
  pageUrl: string | null;
  createdAt: string;
  expiresAt: string;
}

interface ServerCredentialStatus {
  issuerCredentialId: string;
  issuerName: string;
  status: "active" | "expired" | "revoked";
}

interface ApiEnvelope {
  success: boolean;
  data?: unknown;
  error?: string;
}

const PENDING_KEY = ["verification-pending"] as const;

// ── Data fetching ─────────────────────────────────────────────────────────────

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, { credentials: "include", ...init });
  const json = (await res.json()) as ApiEnvelope;
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Request failed (HTTP ${res.status})`);
  }
  return json.data;
}

const fetchPending = () =>
  api("/api/v1/verification/pending") as Promise<PendingRequest[]>;
const fetchCredentialStatus = () =>
  api("/api/v1/credentials") as Promise<ServerCredentialStatus[]>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatField(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function minutesLeft(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000),
  );
}

interface Candidate {
  credential: SDJWTCredential;
  issuerName: string;
  values: { field: string; value: unknown }[];
}

/**
 * Credentials in this browser that can satisfy every requested field and are
 * not revoked/expired (BR-006). Values are decoded so the user sees exactly
 * what would be shared before approving (FR-014).
 */
function findCandidates(
  request: PendingRequest,
  held: SDJWTCredential[],
  statuses: ServerCredentialStatus[],
): Candidate[] {
  const statusById = new Map(statuses.map((s) => [s.issuerCredentialId, s]));
  const now = Date.now();

  return held.flatMap((credential) => {
    const server = statusById.get(credential.id);
    if (server && server.status !== "active") return [];
    if (new Date(credential.expires_at).getTime() < now) return [];

    const fields = new Set(disclosableFields(credential));
    if (!request.requestedFields.every((f) => fields.has(f))) return [];

    const byField = new Map(
      credential.disclosures.map((d) => {
        const decoded = decodeDisclosure(d);
        return [decoded.field, decoded.value] as const;
      }),
    );

    return [
      {
        credential,
        issuerName:
          server?.issuerName ?? credential.display_name ?? credential.issuer,
        values: request.requestedFields.map((field) => ({
          field,
          value: byField.get(field),
        })),
      },
    ];
  });
}

// ── Components ────────────────────────────────────────────────────────────────

function RequestCard({
  request,
  candidates,
}: {
  request: PendingRequest;
  candidates: Candidate[];
}) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState(0);
  const candidate = candidates[chosen];

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: PENDING_KEY });

  const approve = useMutation({
    mutationFn: async () => {
      if (!candidate)
        throw new Error("No matching credential in this browser.");
      const keypair = await getWebSigningKey();
      if (!keypair) {
        throw new Error(
          "This browser has no NexusID signing key. Add a credential here first.",
        );
      }
      const proof = await generateProof({
        credential: candidate.credential,
        requestedFields: request.requestedFields,
        verifierId: request.verifierId,
        nonce: request.nonce,
        signingKey: keypair.privateKey,
      });
      await api("/api/v1/verification/submit-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_requestId: request.requestId,
          proof,
        }),
      });
    },
    onSuccess: refresh,
  });

  const reject = useMutation({
    mutationFn: () =>
      api(`/api/v1/verification/reject/${request.requestId}`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });

  const busy = approve.isPending || reject.isPending;
  const error = (approve.error ?? reject.error) as Error | null;

  return (
    <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#EEF0F6]">
            {request.verifierName}
          </h2>
          <p
            className="text-xs text-[#525A72] mt-0.5"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {request.verifierDomain ?? "unknown domain"}
            {request.pageUrl ? ` · ${request.pageUrl}` : ""}
          </p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-[#F59E0B] bg-[rgba(245,158,11,0.1)] shrink-0">
          Expires in {minutesLeft(request.expiresAt)}m
        </span>
      </div>

      <p className="text-sm text-[#8B92A8] mt-4">
        wants to confirm{" "}
        <span className="text-[#EEF0F6]">
          {request.requestedFields.map(formatField).join(", ")}
        </span>
      </p>

      {candidate ? (
        <>
          {candidates.length > 1 && (
            <select
              value={chosen}
              onChange={(e) => setChosen(Number(e.target.value))}
              className="mt-4 w-full rounded-lg bg-[#0C0E13] border border-[#252C3D] px-3 py-2 text-sm text-[#EEF0F6]"
            >
              {candidates.map((c, i) => (
                <option key={c.credential.id} value={i}>
                  {c.issuerName} — issued{" "}
                  {new Date(c.credential.issued_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}

          <div className="mt-4 rounded-lg border border-[#252C3D] bg-[#0C0E13] p-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#525A72] mb-3">
              Will be shared from {candidate.issuerName} — nothing else
            </p>
            <dl className="space-y-2">
              {candidate.values.map(({ field, value }) => (
                <div key={field} className="flex justify-between gap-4 text-sm">
                  <dt className="text-[#8B92A8]">{formatField(field)}</dt>
                  <dd className="text-[#EEF0F6] text-right">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      ) : (
        // UC-004 3.E1 — the condition cannot be confirmed from held credentials
        <div className="mt-4 rounded-lg border border-[#4A1515] bg-[rgba(239,68,68,0.05)] p-4">
          <p className="text-sm text-[#EF4444]">
            None of the credentials in this browser can confirm these fields.
          </p>
          <p className="text-xs text-[#8B92A8] mt-1">
            Add the right credential from My Credentials, or decline the
            request.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-[#EF4444] mt-4">{error.message}</p>}

      <div className="flex gap-3 mt-5">
        {candidate && (
          <button
            onClick={() => approve.mutate()}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3B6FE8, #5B4FE8)" }}
          >
            {approve.isPending ? "Generating proof…" : "Approve & share"}
          </button>
        )}
        <button
          onClick={() => reject.mutate()}
          disabled={busy}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
          style={{ borderColor: "#4A1515", color: "#EF4444" }}
        >
          {reject.isPending ? "Declining…" : "Decline"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const pending = useQuery({
    queryKey: PENDING_KEY,
    queryFn: fetchPending,
    refetchInterval: 4000, // no push on web — poll for new requests
  });
  const statuses = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentialStatus,
  });

  // Read once per render of fresh data; localStorage is synchronous.
  // Credentials held (encrypted) in this browser — see lib/webWallet.ts.
  const wallet = useQuery({ queryKey: ["web-wallet"], queryFn: listWebCredentials });
  const held = wallet.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "#EEF0F6", fontFamily: "DM Sans, sans-serif" }}
        >
          Requests
        </h1>
        <p className="text-sm text-[#8B92A8] mt-1">
          Verification requests from websites in your paired browser. Nothing is
          shared until you approve.
        </p>
      </div>

      {pending.isLoading ? (
        <p className="text-xs text-[#525A72]">Loading…</p>
      ) : pending.isError ? (
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-8 text-center">
          <p className="text-sm text-[#EF4444]">
            Couldn&apos;t load requests. Try refreshing.
          </p>
        </div>
      ) : !pending.data || pending.data.length === 0 ? (
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-10 text-center">
          <p className="text-sm font-medium text-[#EEF0F6]">
            No pending requests
          </p>
          <p className="text-xs text-[#8B92A8] mt-1">
            Requests appear here when a site asks your paired browser to verify
            you.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {pending.data.map((req) => (
            <RequestCard
              key={req.requestId}
              request={req}
              candidates={findCandidates(req, held, statuses.data ?? [])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
