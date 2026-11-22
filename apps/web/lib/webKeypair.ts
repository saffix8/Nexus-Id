// apps/web/lib/webKeypair.ts
//
// There is no mobile device pairing wired up for the web dashboard (that's
// FR-002/FR-003 — Android Keystore key generation + QR pairing, mobile-only
// per CON-008). Issuing a credential still needs a holder public key to bind
// to, so the web app generates its own RSA-2048 keypair in the browser the
// first time one is needed, registers the public half with the backend, and
// keeps the private half in localStorage — never sent to the server. This is
// a separate, web-only keypair; it is not the mobile Android Keystore key.

const STORAGE_KEY = "nexusid_web_keypair";

interface StoredKeypair {
  publicKeyPem: string;
  privateKeyPem: string;
}

function arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

async function generateKeypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function exportKeypairPem(pair: CryptoKeyPair): Promise<StoredKeypair> {
  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey("spki", pair.publicKey),
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
  ]);

  return {
    publicKeyPem: arrayBufferToPem(spki, "PUBLIC KEY"),
    privateKeyPem: arrayBufferToPem(pkcs8, "PRIVATE KEY"),
  };
}

export function getStoredWebKeypair(): StoredKeypair | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredKeypair;
  } catch {
    return null;
  }
}

/**
 * Returns the holder public key PEM, generating and registering a new
 * keypair with the backend if one doesn't already exist locally.
 */
export async function ensureWebKeypair(): Promise<string> {
  const existing = getStoredWebKeypair();
  if (existing) return existing.publicKeyPem;

  const pair = await generateKeypair();
  const { publicKeyPem, privateKeyPem } = await exportKeypairPem(pair);

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
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ publicKeyPem, privateKeyPem }),
  );

  return publicKeyPem;
}
