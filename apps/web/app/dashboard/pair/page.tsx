"use client";

// Approve a browser pairing on the web (SRS FR-003, API-025, ALG-006/007).
//
// Reached from /pair after a phone camera scans the extension's QR. The
// signed-in End User confirms here; the browser signs the challenge with its
// device key and calls the same API-025 (POST /qr-challenges/redeem) the
// NexusID app uses. The extension is polling (API-024) and confirms on its side.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PENDING_PAIRING_KEY,
  redeemPairingChallenge,
  parsePairingFragment,
  type ScannedChallenge,
} from "@/lib/pairing";

type Loaded =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; payload: ScannedChallenge }
  | { kind: "declined" };

/**
 * Reads the scanned code from the URL fragment, or from storage after login.
 * Idempotent on purpose: React runs effects twice in development, so reading
 * must not consume anything. The fragment is moved into storage and stripped
 * from the address bar; storage is cleared once the user approves or declines.
 */
function readPendingPairing(): ScannedChallenge | null {
  const fragment = window.location.hash.slice(1);
  const fromHash = parsePairingFragment(fragment);

  if (fromHash) {
    try {
      window.sessionStorage.setItem(PENDING_PAIRING_KEY, fragment);
    } catch {
      // Storage unavailable; keep the fragment so a re-run still finds it.
      return fromHash;
    }
    // Drop the one-time code from the address bar and history.
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }

  try {
    const stored = window.sessionStorage.getItem(PENDING_PAIRING_KEY);
    return stored ? parsePairingFragment(stored) : null;
  } catch {
    return null;
  }
}

function clearPendingPairing(): void {
  try {
    window.sessionStorage.removeItem(PENDING_PAIRING_KEY);
  } catch {
    // Nothing stored.
  }
}

export default function ApprovePairingPage() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    const payload = readPendingPairing();
    setState(payload ? { kind: "ready", payload } : { kind: "missing" });
  }, []);

  const mutation = useMutation({
    mutationFn: redeemPairingChallenge,
    onSuccess: () => {
      clearPendingPairing();
      queryClient.invalidateQueries({ queryKey: ["pairing-devices"] });
    },
  });

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "#EEF0F6", fontFamily: "DM Sans, sans-serif" }}
        >
          Pair a browser
        </h1>
        <p className="text-sm text-[#8B92A8] mt-1">
          Link the Chrome extension you just scanned to your NexusID account.
        </p>
      </div>

      <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
        {state.kind === "loading" && (
          <p className="text-xs text-[#525A72]">Loading…</p>
        )}

        {state.kind === "missing" && (
          <>
            <p className="text-sm text-[#EEF0F6]">No pairing code found.</p>
            <p className="text-xs text-[#8B92A8] mt-1">
              Scan the QR code in the NexusID extension again, or paste its code
              on the Devices page.
            </p>
            <Link
              href="/dashboard/devices"
              className="inline-block mt-4 text-xs text-[#3B6FE8] hover:underline"
            >
              Go to Devices
            </Link>
          </>
        )}

        {state.kind === "declined" && (
          <>
            <p className="text-sm text-[#EEF0F6]">Pairing cancelled.</p>
            <p className="text-xs text-[#8B92A8] mt-1">
              Nothing was linked. The code expires on its own within 2 minutes.
            </p>
          </>
        )}

        {state.kind === "ready" && mutation.isSuccess && (
          <>
            <p className="text-sm text-[#22C55E]">Browser paired.</p>
            <p className="text-xs text-[#8B92A8] mt-1">
              The extension will confirm in a few seconds. Verification requests
              from that browser now come to your account.
            </p>
            <Link
              href="/dashboard/devices"
              className="inline-block mt-4 text-xs text-[#3B6FE8] hover:underline"
            >
              View paired devices
            </Link>
          </>
        )}

        {state.kind === "ready" && !mutation.isSuccess && (
          <>
            <p className="text-sm text-[#EEF0F6]">
              Allow this browser to send you verification requests?
            </p>
            <p className="text-xs text-[#8B92A8] mt-1">
              Only approve if you just scanned the QR code in your own NexusID
              extension.
            </p>
            <p
              className="text-xs text-[#525A72] mt-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Pairing · {state.payload.challengeId.slice(0, 8)}
            </p>

            {mutation.isError && (
              <p className="text-xs text-[#EF4444] mt-3">
                {(mutation.error as Error).message}
              </p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => mutation.mutate(state.payload)}
                disabled={mutation.isPending}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #3B6FE8, #5B4FE8)",
                }}
              >
                {mutation.isPending ? "Pairing…" : "Approve"}
              </button>
              <button
                onClick={() => {
                  clearPendingPairing();
                  setState({ kind: "declined" });
                }}
                disabled={mutation.isPending}
                className="flex-1 px-4 py-2 rounded-lg text-sm border border-[#252C3D] text-[#8B92A8] transition-colors hover:text-[#EEF0F6] disabled:opacity-50"
              >
                Not me
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
