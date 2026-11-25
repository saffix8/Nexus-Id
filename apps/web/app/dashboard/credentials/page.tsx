"use client";

// My credentials — web stand-in for mobile SCR-002 (FR-010; DESIGN.md §5.1, §7).
// Document-style CredentialCards with predicate labels only; status Valid / Expired / Revoked.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, WalletCards } from "lucide-react";
import type { CredentialType } from "@nexusid/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CredentialCard,
  EmptyState,
  ErrorState,
  PageHeader,
  type CredentialCardStatus,
} from "@/components/nexus";
import { PRIVACY_LINE, predicatesFor } from "@/components/nexus/category";
import { AddCredentialModal } from "@/components/AddCredentialModal";

interface WalletCredential {
  id: string;
  issuerDid: string;
  issuerName: string;
  credentialType: CredentialType;
  status: "active" | "expired" | "revoked";
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

const STATUS: Record<WalletCredential["status"], CredentialCardStatus> = {
  active: "valid",
  expired: "expired",
  revoked: "revoked",
};

async function fetchCredentials(): Promise<WalletCredential[]> {
  const res = await fetch("/api/v1/credentials", { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success)
    throw new Error(json.error ?? `The NexusID server answered ${res.status}.`);
  return json.data;
}

export default function CredentialsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const credentials = useQuery({
    queryKey: ["credentials"],
    queryFn: fetchCredentials,
  });
  const open = () => setModalOpen(true);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Credentials"
        description={<>Signed by the issuer, bound to this device. {PRIVACY_LINE}</>}
        actions={
          credentials.data && credentials.data.length > 0 ? (
            <Button onClick={open}>
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Add credential
            </Button>
          ) : undefined
        }
      />

      {credentials.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {[0, 1].map((i) => (
            <Skeleton
              key={i}
              className="aspect-[1.586] w-full max-w-[420px] rounded-2xl"
            />
          ))}
        </div>
      ) : credentials.isError ? (
        <ErrorState
          title="Couldn't load your credentials"
          message={credentials.error.message}
          onRetry={() => credentials.refetch()}
          retrying={credentials.isFetching}
        />
      ) : credentials.data.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="Add your first credential"
          description="Get a credential from NADRA, HEC, Air University or LinkedIn. Websites then ask it questions instead of asking for your documents."
          action={{ label: "Add credential", onClick: open }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {credentials.data.map((c) => (
            <CredentialCard
              key={c.id}
              category={c.credentialType}
              status={STATUS[c.status] ?? "valid"}
              predicates={predicatesFor(c.credentialType)}
              credentialId={c.id}
              expiresAt={c.expiresAt}
              issuerName={c.issuerName}
            />
          ))}
        </div>
      )}

      <AddCredentialModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCredentialAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["credentials"] });
          queryClient.invalidateQueries({ queryKey: ["web-wallet"] });
        }}
      />
    </div>
  );
}
