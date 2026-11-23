"use client";

// Landing page for the extension's pairing QR (SRS FR-003).
//
// A phone camera opens <web origin>/pair#p=..&c=.. . The code lives in the URL
// fragment, which the login redirect would drop, so it is parked in
// sessionStorage first and then handed to /dashboard/pair (which the auth
// middleware guards). This page is deliberately outside the middleware matcher.

import { useEffect, useState } from "react";
import Link from "next/link";
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
    <main className="min-h-screen bg-[#0C0E13] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#13161E] border border-[#1E2330] rounded-xl p-6 text-center">
        {invalid ? (
          <>
            <h1 className="text-base font-semibold text-[#EEF0F6]">
              Not a valid pairing link
            </h1>
            <p className="text-xs text-[#8B92A8] mt-2">
              Open the NexusID extension, choose Pair device, and scan the new
              QR code.
            </p>
            <Link
              href="/dashboard/devices"
              className="inline-block mt-4 text-xs text-[#3B6FE8] hover:underline"
            >
              Go to Devices
            </Link>
          </>
        ) : (
          <p className="text-xs text-[#8B92A8]">Opening NexusID…</p>
        )}
      </div>
    </main>
  );
}
