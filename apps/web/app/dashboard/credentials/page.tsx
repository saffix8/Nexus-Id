"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CredentialType } from "@nexusid/types";
import {
  CREDENTIAL_TYPE_LABELS,
  CREDENTIAL_TYPE_ICONS,
  CREDENTIAL_TYPE_COLORS,
  CREDENTIAL_TYPE_BG,
} from "@/lib/constants";
import { AddCredentialModal } from "@/components/AddCredentialModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type CredentialStatus = "active" | "expired" | "revoked";

interface CredentialMetadata {
  always_visible_fields: string[];
  selectively_disclosable_fields: string[];
  field_labels: Record<string, string>;
}

interface WalletCredential {
  id: string;
  issuerDid: string;
  issuerName: string;
  credentialType: CredentialType;
  status: CredentialStatus;
  metadata: CredentialMetadata;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCredentials(): Promise<WalletCredential[]> {
  const res = await fetch("/api/v1/credentials", { credentials: "include" });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load credentials");
  }
  return json.data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const STATUS_META: Record<
  CredentialStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  active: {
    label: "Active",
    bg: "#0F2A1A",
    text: "#22C55E",
    border: "#16532F",
  },
  expired: {
    label: "Expired",
    bg: "#1A1E28",
    text: "#525A72",
    border: "#252C3D",
  },
  revoked: {
    label: "Revoked",
    bg: "#250F0F",
    text: "#EF4444",
    border: "#4A1515",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CredentialStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded"
      style={{
        background: m.bg,
        color: m.text,
        border: `1px solid ${m.border}`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}

function ExpiryLine({ cred }: { cred: WalletCredential }) {
  if (cred.status === "revoked") {
    return (
      <span className="text-xs" style={{ color: "#EF4444" }}>
        Revoked {cred.revokedAt ? formatDate(cred.revokedAt) : ""}
      </span>
    );
  }

  if (cred.status === "expired") {
    return (
      <span className="text-xs text-[#525A72]">
        Expired {formatDate(cred.expiresAt)}
      </span>
    );
  }

  const days = daysUntil(cred.expiresAt);
  return (
    <span
      className="text-xs"
      style={{ color: days <= 30 ? "#F59E0B" : "#525A72" }}
    >
      {days <= 30
        ? `Expires in ${days}d`
        : `Expires ${formatDate(cred.expiresAt)}`}
    </span>
  );
}

function CredentialCard({ cred }: { cred: WalletCredential }) {
  const color = CREDENTIAL_TYPE_COLORS[cred.credentialType];
  const bg = CREDENTIAL_TYPE_BG[cred.credentialType];
  const icon = CREDENTIAL_TYPE_ICONS[cred.credentialType];
  const typeLabel = CREDENTIAL_TYPE_LABELS[cred.credentialType];
  const revoked = cred.status === "revoked";

  const fields = cred.metadata.selectively_disclosable_fields.slice(0, 4);
  const extraCount =
    cred.metadata.selectively_disclosable_fields.length - fields.length;

  return (
    <div
      className="bg-[#13161E] border rounded-xl p-5 flex flex-col gap-4 transition-opacity"
      style={{
        borderColor: revoked ? "#252C3D" : "#1E2330",
        opacity: revoked ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: bg, border: `1px solid ${color}25` }}
          >
            {icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#EEF0F6]">
              {cred.issuerName}
            </p>
            <p className="text-xs" style={{ color }}>
              {typeLabel}
            </p>
          </div>
        </div>
        <StatusBadge status={cred.status} />
      </div>

      {fields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fields.map((f) => (
            <span
              key={f}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "#1A1E28",
                color: "#8B92A8",
                border: "1px solid #252C3D",
              }}
            >
              {cred.metadata.field_labels[f] ?? f}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="text-[10px] font-mono text-[#525A72]">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-[#1E2330]">
        <span className="text-xs text-[#525A72]">
          Issued {formatDate(cred.issuedAt)}
        </span>
        <ExpiryLine cred={cred} />
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#1A1E28] border border-[#252C3D] flex items-center justify-center mb-4 text-3xl">
        🆔
      </div>
      <p className="text-sm font-medium text-[#EEF0F6] mb-1">
        No credentials yet
      </p>
      <p className="text-xs text-[#8B92A8] max-w-xs mb-4">
        Connect NADRA, HEC, your university, or LinkedIn to start proving things
        about yourself without oversharing.
      </p>
      <button
        onClick={onAdd}
        className="text-sm px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #3B6FE8, #5B4FE8)" }}
      >
        + Add Credential
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-44 bg-[#13161E] border border-[#1E2330] rounded-xl"
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentials,
  });

  function handleCredentialAdded() {
    queryClient.invalidateQueries({ queryKey: ["credentials"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "#EEF0F6", fontFamily: "DM Sans, sans-serif" }}
          >
            My Credentials
          </h1>
          <p className="text-sm text-[#8B92A8] mt-1">
            Credentials you've verified and added to your wallet
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3B6FE8, #5B4FE8)" }}
        >
          + Add Credential
        </button>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-8 text-center">
          <p className="text-sm text-[#EF4444]">
            Couldn't load your credentials. Try refreshing.
          </p>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl">
          <EmptyState onAdd={() => setModalOpen(true)} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {data.map((cred) => (
            <CredentialCard key={cred.id} cred={cred} />
          ))}
        </div>
      )}

      <AddCredentialModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCredentialAdded={handleCredentialAdded}
      />
    </div>
  );
}
