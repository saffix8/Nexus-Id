// apps/web/lib/webWallet.ts
//
// Browser-side credential store for the web stand-in holder.
//
// The backend deliberately stores credential METADATA only — never the SD-JWT
// or its disclosures (privacy by design). The full credential returned by the
// issuer therefore has to live with the holder. On mobile that is encrypted
// on-device storage (CON-009); here it is AES-GCM encrypted in IndexedDB with
// a non-extractable key (lib/webVault.ts).

import type { SDJWTCredential } from "@nexusid/types";
import { getEncrypted, putEncrypted } from "@/lib/webVault";

const WALLET_RECORD = "wallet";
/** Pre-encryption plaintext store — migrated on first read, then removed. */
const LEGACY_STORAGE_KEY = "nexusid_web_wallet";

type WalletMap = Record<string, SDJWTCredential>;

async function readAll(): Promise<WalletMap> {
  if (typeof window === "undefined") return {};

  const stored = (await getEncrypted<WalletMap>(WALLET_RECORD)) ?? {};

  // One-time migration of credentials saved before encryption existed.
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      const parsed: unknown = JSON.parse(legacy);
      if (parsed && typeof parsed === "object")
        Object.assign(stored, parsed as WalletMap);
      await putEncrypted(WALLET_RECORD, stored);
    } catch {
      // Unreadable legacy data — drop it.
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  return stored;
}

/** Keeps an issued credential (sd_jwt + all disclosures), encrypted, in this browser. */
export async function saveWebCredential(
  credential: SDJWTCredential,
): Promise<void> {
  if (typeof window === "undefined") return;
  const all = await readAll();
  all[credential.id] = credential;
  await putEncrypted(WALLET_RECORD, all);
}

/** All credentials held by this browser. */
export async function listWebCredentials(): Promise<SDJWTCredential[]> {
  return Object.values(await readAll());
}
