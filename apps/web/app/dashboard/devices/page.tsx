"use client";

// Paired browsers (SRS FR-032) and the web stand-in for device pairing
// (SRS UC-002 / FR-003). The SRS has the mobile app scan the extension's QR;
// until the mobile app is runnable, the signed-in web user can paste the
// extension's pairing code here instead. Both call POST /pairing/claim.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PairedDevice {
  pairingId: string;
  status: "paired" | "revoked";
  pairedAt: string | null;
  revokedAt: string | null;
}

interface PairFormValues {
  pairingCode: string;
}

// Exact payload the extension encodes into its QR / copies to the clipboard.
const PairingPayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal("nexusid-pair"),
  pairingId: z.string().uuid(),
  code: z.string().min(1),
});

type PairingPayload = z.infer<typeof PairingPayloadSchema>;

const DEVICES_KEY = ["pairing-devices"] as const;

// ── Data fetching ─────────────────────────────────────────────────────────────

async function readJson(
  res: Response,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return (await res.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

async function fetchDevices(): Promise<PairedDevice[]> {
  const res = await fetch("/api/v1/pairing/devices", {
    credentials: "include",
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load paired devices");
  }
  return json.data as PairedDevice[];
}

async function claimPairing(payload: PairingPayload): Promise<void> {
  const res = await fetch("/api/v1/pairing/claim", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingId: payload.pairingId, code: payload.code }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Pairing failed");
  }
}

async function revokePairing(pairingId: string): Promise<void> {
  const res = await fetch(`/api/v1/pairing/devices/${pairingId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Could not revoke this browser");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function parsePairingCode(raw: string): PairingPayload | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  const parsed = PairingPayloadSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

// ── Components ────────────────────────────────────────────────────────────────

function PairBrowserCard() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<PairFormValues>({ defaultValues: { pairingCode: "" } });

  const mutation = useMutation({
    mutationFn: claimPairing,
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: DEVICES_KEY });
    },
    onError: (err: Error) => {
      setError("pairingCode", { message: err.message });
    },
  });

  function onSubmit(values: PairFormValues) {
    const payload = parsePairingCode(values.pairingCode);
    if (!payload) {
      setError("pairingCode", {
        message:
          "That isn't a NexusID pairing code. Copy it again from the extension.",
      });
      return;
    }
    mutation.mutate(payload);
  }

  return (
    <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
      <h2 className="text-sm font-semibold text-[#EEF0F6]">Pair a browser</h2>
      <p className="text-xs text-[#8B92A8] mt-1 mb-4 max-w-xl">
        Open the NexusID extension, choose{" "}
        <span className="text-[#EEF0F6]">Pair device</span>, then{" "}
        <span className="text-[#EEF0F6]">Copy code instead</span> and paste it
        here. Verification requests from that browser will then be routed to
        your account. The code expires after 5 minutes.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <textarea
          {...register("pairingCode", {
            required: "Paste the pairing code from the extension",
          })}
          rows={3}
          spellCheck={false}
          placeholder='{"v":1,"type":"nexusid-pair",...}'
          className="w-full rounded-lg bg-[#0C0E13] border border-[#252C3D] px-3 py-2 text-xs text-[#EEF0F6] placeholder:text-[#525A72] focus:outline-none focus:border-[#3B6FE8]"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        />
        {errors.pairingCode?.message && (
          <p className="text-xs text-[#EF4444]">{errors.pairingCode.message}</p>
        )}
        {mutation.isSuccess && (
          <p className="text-xs text-[#22C55E]">
            Browser paired. The extension will confirm in a moment.
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #3B6FE8, #5B4FE8)" }}
        >
          {mutation.isPending ? "Pairing…" : "Pair browser"}
        </button>
      </form>
    </div>
  );
}

function DeviceRow({ device }: { device: PairedDevice }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: revokePairing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEVICES_KEY }),
  });
  const revoked = device.status === "revoked";

  return (
    <li
      className="flex items-center justify-between py-4 border-b border-[#1E2330] last:border-b-0"
      style={{ opacity: revoked ? 0.5 : 1 }}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#EEF0F6]">
            Chrome extension
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
            style={
              revoked
                ? { color: "#EF4444", background: "rgba(239,68,68,0.1)" }
                : { color: "#22C55E", background: "rgba(34,197,94,0.1)" }
            }
          >
            {device.status}
          </span>
        </div>
        <p
          className="text-xs text-[#525A72] mt-1"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {revoked
            ? `Revoked ${formatDateTime(device.revokedAt)}`
            : `Paired ${formatDateTime(device.pairedAt)}`}{" "}
          · {device.pairingId.slice(0, 8)}
        </p>
        {mutation.isError && (
          <p className="text-xs text-[#EF4444] mt-1">
            {(mutation.error as Error).message}
          </p>
        )}
      </div>
      {!revoked && (
        <button
          onClick={() => mutation.mutate(device.pairingId)}
          disabled={mutation.isPending}
          className="text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50"
          style={{ borderColor: "#4A1515", color: "#EF4444" }}
        >
          {mutation.isPending ? "Revoking…" : "Revoke"}
        </button>
      )}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: DEVICES_KEY,
    queryFn: fetchDevices,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "#EEF0F6", fontFamily: "DM Sans, sans-serif" }}
        >
          Devices
        </h1>
        <p className="text-sm text-[#8B92A8] mt-1">
          Browsers paired with your NexusID account. Revoke one to stop its
          verification requests reaching you.
        </p>
      </div>

      <PairBrowserCard />

      <div className="bg-[#13161E] border border-[#1E2330] rounded-xl px-6 py-2">
        {isLoading ? (
          <p className="text-xs text-[#525A72] py-4">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-[#EF4444] py-4">
            Couldn&apos;t load your devices. Try refreshing.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="text-xs text-[#525A72] py-4">No browsers paired yet.</p>
        ) : (
          <ul>
            {data.map((device) => (
              <DeviceRow key={device.pairingId} device={device} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
