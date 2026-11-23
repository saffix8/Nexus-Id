// apps/web/lib/webVault.ts
//
// At-rest protection for the web stand-in holder (SRS CON-009, and the spirit
// of CON-008). Everything lives in IndexedDB:
//
//   - the signing key: a NON-EXTRACTABLE WebCrypto RSA private key — page code
//     can sign with it but can never read the key material out;
//   - a NON-EXTRACTABLE AES-GCM-256 key that encrypts stored records
//     (credentials) before they are written.
//
// IndexedDB can store CryptoKey objects directly while keeping them
// non-extractable, which localStorage (strings only) cannot.

const DB_NAME = "nexusid_vault";
const DB_VERSION = 1;
const KEYS = "keys"; // CryptoKey / CryptoKeyPair objects
const RECORDS = "records"; // AES-GCM encrypted blobs

const AES_KEY_ID = "record-encryption";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS);
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function vaultGet<T>(
  store: "keys" | "records",
  id: string,
): Promise<T | undefined> {
  return withStore<T | undefined>(
    store,
    "readonly",
    (s) => s.get(id) as IDBRequest<T | undefined>,
  );
}

export async function vaultPut(
  store: "keys" | "records",
  id: string,
  value: unknown,
): Promise<void> {
  await withStore(store, "readwrite", (s) => s.put(value, id));
}

// ── Record encryption ────────────────────────────────────────────────────────

async function recordKey(): Promise<CryptoKey> {
  const existing = await vaultGet<CryptoKey>(KEYS, AES_KEY_ID);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
  await vaultPut(KEYS, AES_KEY_ID, key);
  return key;
}

interface EncryptedRecord {
  v: 1;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

/** Encrypts a JSON value with AES-GCM and stores it under `id`. */
export async function putEncrypted(id: string, value: unknown): Promise<void> {
  const key = await recordKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const record: EncryptedRecord = { v: 1, iv, ct };
  await vaultPut(RECORDS, id, record);
}

/** Reads and decrypts the JSON value stored under `id`. */
export async function getEncrypted<T>(id: string): Promise<T | null> {
  const record = await vaultGet<EncryptedRecord>(RECORDS, id);
  if (!record) return null;
  const key = await recordKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: record.iv },
    key,
    record.ct,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
