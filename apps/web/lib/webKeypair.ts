// apps/web/lib/webKeypair.ts
//
// There is no mobile device available to the web dashboard, but issuing and
// presenting credentials needs a holder keypair. The web app therefore
// generates its own RSA-2048 keypair in the browser the first time one is
// needed and registers the public half with the backend. This is a separate,
// web-only keypair; it is not the mobile Android Keystore key.
//
// The private key is a NON-EXTRACTABLE WebCrypto key kept in IndexedDB
// (lib/webVault.ts): it can sign key-binding JWTs but can never be read out,
// exported or sent anywhere — the browser analogue of CON-008.

import { vaultGet, vaultPut } from "@/lib/webVault";

const KEYPAIR_ID = "signing-keypair";
/** Pre-hardening store (PEMs in localStorage) — migrated once, then removed. */
const LEGACY_STORAGE_KEY = "nexusid_web_keypair";

const RSA_PARAMS = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export interface WebSigningKey {
  publicKeyPem: string;
  /** Non-extractable — usable only for signing. */
  privateKey: CryptoKey;
}

function arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Imports a pre-hardening PEM keypair as a non-extractable key, then deletes the PEM. */
async function migrateLegacyKeypair(): Promise<WebSigningKey | null> {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;

  try {
    const legacy = JSON.parse(raw) as {
      publicKeyPem: string;
      privateKeyPem: string;
    };
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(legacy.privateKeyPem),
      RSA_PARAMS,
      false, // non-extractable from now on
      ["sign"],
    );
    const migrated: WebSigningKey = {
      publicKeyPem: legacy.publicKeyPem,
      privateKey,
    };
    await vaultPut("keys", KEYPAIR_ID, migrated);
    return migrated;
  } catch {
    return null;
  } finally {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

/** This browser's holder signing key, or null if none has been created yet. */
export async function getWebSigningKey(): Promise<WebSigningKey | null> {
  if (typeof window === "undefined") return null;
  const stored = await vaultGet<WebSigningKey>("keys", KEYPAIR_ID);
  return stored ?? (await migrateLegacyKeypair());
}

/**
 * Returns the holder public key PEM, generating and registering a new
 * keypair with the backend if one doesn't already exist locally.
 */
export async function ensureWebKeypair(): Promise<string> {
  const existing = await getWebSigningKey();
  if (existing) return existing.publicKeyPem;

  const pair = await crypto.subtle.generateKey(
    {
      ...RSA_PARAMS,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    false, // private key non-extractable (the public key is always exportable)
    ["sign", "verify"],
  );
  const publicKeyPem = arrayBufferToPem(
    await crypto.subtle.exportKey("spki", pair.publicKey),
    "PUBLIC KEY",
  );

  const res = await fetch("/api/v1/users/me/public-key", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: publicKeyPem }),
  });
  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Failed to register device key");
  }

  // Only persist locally once the backend has confirmed it — otherwise a
  // failed registration would get cached and silently never retried.
  await vaultPut("keys", KEYPAIR_ID, {
    publicKeyPem,
    privateKey: pair.privateKey,
  });

  return publicKeyPem;
}
