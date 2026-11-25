"use client";

// Devices — paired browsers (FR-038) and the web stand-in for device pairing (FR-003, API-025).
// The SRS has the phone scan the extension's QR; the signed-in web user can also paste the
// extension's pairing link here. Both redeem via API-025, signed with the device key.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PairedDevices } from "@/components/nexus/PairedDevices";
import { PageHeader } from "@/components/nexus/PageHeader";
import { useNow } from "@/hooks/use-now";
import { PAIRINGS_KEY } from "@/lib/userApi";
import { parsePairingInput, redeemPairingChallenge } from "@/lib/pairing";
import { cn } from "@/lib/utils";

interface PairFormValues {
  pairingCode: string;
}

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
    mutationFn: redeemPairingChallenge,
    onSuccess: () => {
      reset();
      toast.success("Browser paired", {
        description: "The extension confirms in a moment.",
      });
      queryClient.invalidateQueries({ queryKey: PAIRINGS_KEY });
    },
    onError: (err: Error) => setError("pairingCode", { message: err.message }),
  });

  function onSubmit(values: PairFormValues) {
    const payload = parsePairingInput(values.pairingCode);
    if (!payload) {
      setError("pairingCode", {
        message:
          "That isn't a NexusID pairing link. Copy it again from the extension.",
      });
      return;
    }
    mutation.mutate(payload);
  }

  const error = errors.pairingCode?.message;
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="font-display text-base font-semibold text-foreground">
          Pair a browser
        </h2>
        <p className="max-w-2xl text-sm text-text-muted">
          Open the NexusID extension and scan its code with the NexusID app. No
          phone at hand? Choose{" "}
          <span className="text-foreground">Copy code</span> under the
          extension&apos;s QR and paste it here. The code is valid for 2
          minutes.
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
        <label htmlFor="pairingCode" className="sr-only">
          Pairing link
        </label>
        <textarea
          id="pairingCode"
          {...register("pairingCode", {
            required: "Paste the pairing link from the extension",
          })}
          rows={3}
          spellCheck={false}
          placeholder="http://…/pair#p=…&c=…"
          aria-invalid={!!error}
          aria-describedby={error ? "pairingCode-error" : undefined}
          className={cn(
            "w-full rounded-lg border bg-inset px-3 py-2 font-mono text-xs text-foreground placeholder:text-text-faint",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            error ? "border-danger" : "border-border",
          )}
        />
        {error && (
          <p id="pairingCode-error" className="text-xs text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {mutation.isPending ? "Pairing…" : "Pair browser"}
        </Button>
      </form>
    </Card>
  );
}

export default function DevicesPage() {
  const now = useNow();
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Devices"
        description="Browsers paired with your account can send you verification requests. Revoke one to stop them."
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <PairedDevices now={now} showPairLink={false} />
        <PairBrowserCard />
      </div>
    </div>
  );
}
