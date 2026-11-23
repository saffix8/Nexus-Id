"use client";

// API key management (SRS UC-009, FR-034, BR-009). Keys are stored only as a
// hash, so a key is visible exactly once — right after it is generated.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { VerifierIntegrationCode } from "@/components/VerifierIntegrationCode";
import {
  rotateApiKey,
  useVerifierProfile,
  VERIFIER_PROFILE_KEY,
  type IssuedApiKey,
} from "@/lib/verifierApi";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, isError } = useVerifierProfile();
  const [confirming, setConfirming] = useState(false);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const rotate = useMutation({
    mutationFn: rotateApiKey,
    onSuccess: (key) => {
      setIssued(key);
      setConfirming(false);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: VERIFIER_PROFILE_KEY });
    },
  });

  async function copy() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.apiKey);
    setCopied(true);
  }

  if (isLoading) return <p className="text-xs text-[#525A72]">Loading…</p>;
  if (isError || !profile) {
    return (
      <p className="text-sm text-[#EF4444]">
        Couldn&apos;t load your account. Try signing in again.
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#EEF0F6]">Active API key</h2>
        <p className="text-xs text-[#8B92A8] mt-1">
          Your website embeds this key so NexusID knows verification requests
          come from {profile.displayName}.
        </p>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-[#252C3D] bg-[#0C0E13] px-4 py-3">
          <div>
            <p
              className="text-sm text-[#EEF0F6]"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {profile.apiKeyPrefix
                ? `${profile.apiKeyPrefix}••••••••••••••••`
                : "No key yet"}
            </p>
            <p className="text-xs text-[#525A72] mt-1">
              Generated {formatDateTime(profile.apiKeyRotatedAt)}
            </p>
          </div>
          {!confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #3B6FE8, #5B4FE8)",
              }}
            >
              {profile.apiKeyPrefix ? "Rotate key" : "Generate key"}
            </button>
          )}
        </div>

        {confirming && (
          <div className="mt-4 rounded-lg border border-[#4A3A15] bg-[rgba(245,158,11,0.06)] p-4">
            <p className="text-sm text-[#F59E0B]">
              The current key stops working immediately. Any page still using it
              will fail to start verifications until you update it.
            </p>
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => rotate.mutate()}
                disabled={rotate.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #3B6FE8, #5B4FE8)",
                }}
              >
                {rotate.isPending ? "Generating…" : "Generate new key"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 rounded-lg text-sm text-[#8B92A8] border border-[#252C3D]"
              >
                Cancel
              </button>
            </div>
            {rotate.isError && (
              <p className="text-xs text-[#EF4444] mt-2">
                {(rotate.error as Error).message}
              </p>
            )}
          </div>
        )}

        {issued && (
          <div className="mt-4 rounded-lg border border-[#16532F] bg-[rgba(34,197,94,0.06)] p-4">
            <p className="text-sm text-[#22C55E] font-medium">
              New key — copy it now, it won&apos;t be shown again
            </p>
            <div
              className="mt-3 rounded-md border border-[#252C3D] bg-[#0A0C10] px-3 py-2 text-sm text-[#EEF0F6] break-all"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {issued.apiKey}
            </div>
            <button
              onClick={copy}
              className="mt-3 text-xs text-[#3B6FE8] hover:text-[#4A7EF7]"
            >
              {copied ? "Copied" : "Copy key"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[#EEF0F6]">
          Embed on your page
        </h2>
        <VerifierIntegrationCode
          apiKey={issued?.apiKey ?? "YOUR_API_KEY"}
          verifierId={profile.domain}
          verifierName={profile.displayName}
          fields={["degree_title", "university"]}
        />
      </div>
    </div>
  );
}
