/**
 * storage.service.ts
 * NexusID Mobile — encrypted on-device credential store (CON-010, BR-011).
 *
 * Each credential (the SD-JWT and all its disclosures) is sealed with
 * AES-256-GCM (@noble/ciphers) under a 256-bit key that lives in
 * react-native-keychain (Android Keystore-backed). Every write uses a fresh
 * random 96-bit IV; GCM's tag detects tampering. Only ciphertext reaches
 * AsyncStorage, and none of it is ever sent to the backend.
 *
 * Verification history and pending requests are not stored here — they come
 * from the backend (API-038, GET /verification/pending) and carry no claim values.
 *
 * Replaces the earlier react-native-sqlite-storage version: that package no
 * longer builds on Gradle 9 (jcenter) and its `key` option is ignored without
 * a SQLCipher build, so the database was never actually encrypted.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { SDJWTCredential } from '@nexusid/types';
import {
  base64urlDecodeBytes,
  base64urlEncodeBytes,
  utf8Decode,
  utf8Encode,
} from '../crypto/holder';

// ─── Constants ────────────────────────────────────────────────────────────────

const KEYCHAIN_SERVICE = 'com.nexusid.credential-store';
const KEYCHAIN_ACCOUNT = 'aes-256-gcm-key';
const INDEX_KEY = '@nexusid/credentials/index';
const ITEM_PREFIX = '@nexusid/credentials/item/';
const FORMAT_VERSION = 1;

// ─── Errors ──────────────────────────────────────────────────────────────────

export class StorageError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

export class StorageNotInitializedError extends StorageError {
  constructor() {
    super('StorageService has not been initialised. Call initialize() first.');
    this.name = 'StorageNotInitializedError';
  }
}

// ─── AES-256-GCM helpers ─────────────────────────────────────────────────────

interface SealedRecord {
  v: number;
  iv: string; // base64url, 12 bytes
  ct: string; // base64url, ciphertext || 16-byte tag
}

function seal(key: Uint8Array, plaintext: string, aad: string): SealedRecord {
  const iv = randomBytes(12);
  const ct = gcm(key, iv, utf8Encode(aad)).encrypt(utf8Encode(plaintext));
  return {
    v: FORMAT_VERSION,
    iv: base64urlEncodeBytes(iv),
    ct: base64urlEncodeBytes(ct),
  };
}

function open(key: Uint8Array, record: SealedRecord, aad: string): string {
  if (record.v !== FORMAT_VERSION)
    throw new StorageError(`Unsupported record format ${record.v}`);
  const pt = gcm(key, base64urlDecodeBytes(record.iv), utf8Encode(aad)).decrypt(
    base64urlDecodeBytes(record.ct),
  );
  return utf8Decode(pt);
}

// ─── StorageService ──────────────────────────────────────────────────────────

class StorageService {
  private key: Uint8Array | null = null;

  /** Loads (or creates on first run) the AES key from the Keystore-backed keychain. */
  async initialize(): Promise<void> {
    if (this.key) return;
    try {
      this.key = await this.getOrCreateKey();
    } catch (error) {
      throw new StorageError(
        'Could not unlock the encrypted credential store',
        error,
      );
    }
  }

  private async getOrCreateKey(): Promise<Uint8Array> {
    const existing = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
    });
    if (existing) {
      const key = base64urlDecodeBytes(existing.password);
      if (key.length === 32) return key;
    }
    if (typeof (globalThis as { crypto?: { getRandomValues?: unknown } }).crypto?.getRandomValues !== 'function') {
      // Never fall back to Math.random for key material.
      throw new StorageError(
        'No secure random number generator available (react-native-get-random-values not loaded).',
      );
    }
    const key = randomBytes(32);
    await Keychain.setGenericPassword(
      KEYCHAIN_ACCOUNT,
      base64urlEncodeBytes(key),
      {
        service: KEYCHAIN_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
    return key;
  }

  private requireKey(): Uint8Array {
    if (!this.key) throw new StorageNotInitializedError();
    return this.key;
  }

  private async readIndex(): Promise<string[]> {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    try {
      const ids: unknown = JSON.parse(raw);
      return Array.isArray(ids)
        ? ids.filter((x): x is string => typeof x === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private async writeIndex(ids: string[]): Promise<void> {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)]));
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  /** Encrypts and stores (or replaces) a credential. */
  async saveCredential(credential: SDJWTCredential): Promise<void> {
    const key = this.requireKey();
    try {
      const sealed = seal(key, JSON.stringify(credential), credential.id);
      await AsyncStorage.setItem(
        ITEM_PREFIX + credential.id,
        JSON.stringify(sealed),
      );
      await this.writeIndex([...(await this.readIndex()), credential.id]);
    } catch (error) {
      throw new StorageError('Failed to save credential', error);
    }
  }

  /** Decrypts one credential; null if missing. Throws if the record was tampered with. */
  async getCredential(id: string): Promise<SDJWTCredential | null> {
    const key = this.requireKey();
    const raw = await AsyncStorage.getItem(ITEM_PREFIX + id);
    if (!raw) return null;
    try {
      return JSON.parse(
        open(key, JSON.parse(raw) as SealedRecord, id),
      ) as SDJWTCredential;
    } catch (error) {
      throw new StorageError(`Credential ${id} could not be decrypted`, error);
    }
  }

  /** All credentials, oldest first. Unreadable records are skipped. */
  async getAllCredentials(): Promise<SDJWTCredential[]> {
    this.requireKey();
    const out: SDJWTCredential[] = [];
    for (const id of await this.readIndex()) {
      try {
        const c = await this.getCredential(id);
        if (c) out.push(c);
      } catch (error) {
        console.warn(
          '[StorageService] skipping unreadable credential',
          id,
          error,
        );
      }
    }
    return out;
  }

  async deleteCredential(id: string): Promise<void> {
    this.requireKey();
    try {
      await AsyncStorage.removeItem(ITEM_PREFIX + id);
      await this.writeIndex((await this.readIndex()).filter(x => x !== id));
    } catch (error) {
      throw new StorageError('Failed to delete credential', error);
    }
  }

  /** Removes every credential and the key (sign-out of this device). */
  async clearAllData(): Promise<void> {
    const ids = await this.readIndex();
    await AsyncStorage.removeMany([
      INDEX_KEY,
      ...ids.map(id => ITEM_PREFIX + id),
    ]);
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    this.key = null;
  }
}

export { StorageService };
export const storageService = new StorageService();
export default storageService;
