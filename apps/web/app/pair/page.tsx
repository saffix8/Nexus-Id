"use client";

// Landing page for NexusID QR links: extension pairing (FR-003) and portal sign-in (FR-036, t=SIGN_IN).
//
// A phone camera opens <web origin>/pair#p=..&c=.. . The code lives in the URL
// fragment, which the login redirect would drop, so it is parked in
// sessionStorage first and then handed to /dashboard/pair (which the auth
// middleware guards). This page is deliberately outside the middleware matcher.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PENDING_PAIRING_KEY, parsePairingFragment } from "@/lib/pairing";

export default function PairLandingPage() {
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!parsePairingFragment(fragment)) {
      setInvalid(true);
      return;
    }

    try {
      window.sessionStorage.setItem(PENDING_PAIRING_KEY, fragment);
    } catch {
      // Storage blocked: the fragment still rides along below when the user
      // is already signed in.
    }

    // Full navigation so the auth middleware runs; keeps the fragment too.
    window.location.replace(`/dashboard/pair#${fragment}`);
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        {invalid ? (
          <>
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-overlay text-text-muted">
              <QrCode className="size-8" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-base font-semibold text-foreground">Not a NexusID code</h1>
            <p className="mt-2 text-sm text-text-muted">
              Scan the code again: the one in the NexusID extension, or the one on the sign-in page.
            </p>
            <Button asChild variant="secondary" className="mt-5">
              <Link href="/dashboard/devices">Go to Devices</Link>
            </Button>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-text-muted" aria-live="polite">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Opening NexusID…
          </p>
        )}
      </Card>
    </main>
  );
}
