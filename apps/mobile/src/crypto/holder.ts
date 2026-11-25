// apps/mobile/src/crypto/holder.ts
//
// On-device SD-JWT holder (ALG-001): selective disclosure + key-binding JWT.
//
// MIRRORS packages/sd-jwt/src/holder.ts and apps/web/lib/webHolder.ts
// (selectDisclosures, computeSdHash, createKeyBinding, generateProof). The
// package hashes with Node's `crypto` and decodes with jose/TextDecoder, none
// of which exist on Hermes, so this copy uses pure-JS SHA-256 (@noble/hashes)
// and its own base64url/UTF-8 helpers. The disclosure format, sd_hash input
// and KB-JWT claims are identical — any change to holder.ts must be mirrored
// here. Cross-checked against the backend verifier: scripts/check-mobile-holder.mts.
//
// Platform-free on purpose (no React Native imports): the signer is injected,
// so the same code runs in the Node cross-check and on the phone, where the
// signer is the Android Keystore key (keystore.service.ts → createSignature).

import { sha256 } from '@noble/hashes/sha2.js';
import type { Presentation, Proof, SDJWTCredential } from '@nexusid/types';

// ─── base64url / UTF-8 ────────────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64[i]] = i;
B64_LOOKUP['+'] = 62;
B64_LOOKUP['/'] = 63;

/** Bytes → base64url without padding. */
export function base64urlEncodeBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64[(n >> 18) & 63] +
      B64[(n >> 12) & 63] +
      B64[(n >> 6) & 63] +
      B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out;
}

/** base64 or base64url (padding optional) → bytes. */
export function base64urlDecodeBytes(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (const ch of clean) {
    const v = B64_LOOKUP[ch];
    if (v === undefined) throw new Error('Invalid base64url input');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** String → UTF-8 bytes (no TextEncoder dependency). */
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000)
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63),
      );
  }
  return Uint8Array.from(out);
}

/** UTF-8 bytes → string (no TextDecoder dependency). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    let c: number;
    if (b < 0x80) c = b;
    else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 0xf0)
      c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else
      c =
        ((b & 7) << 18) |
        ((bytes[i++] & 63) << 12) |
        ((bytes[i++] & 63) << 6) |
        (bytes[i++] & 63);
    out += String.fromCodePoint(c);
  }
  return out;
}

export function base64urlEncodeString(s: string): string {
  return base64urlEncodeBytes(utf8Encode(s));
}

/** SHA-256 → base64url (no padding). */
export function sha256Base64url(input: string): string {
  return base64urlEncodeBytes(sha256(utf8Encode(input)));
}

// ─── Disclosures ──────────────────────────────────────────────────────────────

export class DisclosureNotFoundError extends Error {
  constructor(public readonly field: string) {
    super(`This credential does not contain the field "${field}".`);
    this.name = 'DisclosureNotFoundError';
  }
}

export interface DecodedDisclosure {
  salt: string;
  field: string;
  value: unknown;
}

/** base64url "[salt, field, value]" → parts. Mirrors decodeDisclosureInternal. */
export function decodeDisclosure(disclosure: string): DecodedDisclosure {
  const parsed: unknown = JSON.parse(
    utf8Decode(base64urlDecodeBytes(disclosure)),
  );
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string'
  ) {
    throw new Error('Malformed disclosure');
  }
  return { salt: parsed[0], field: parsed[1], value: parsed[2] };
}

/** Field names this credential can selectively disclose. */
export function disclosableFields(credential: SDJWTCredential): string[] {
  const fields: string[] = [];
  for (const d of credential.disclosures ?? []) {
    try {
      fields.push(decodeDisclosure(d).field);
    } catch {
      // skip malformed
    }
  }
  return fields;
}

/** Only the disclosures for the requested fields; throws if any is missing. Mirrors selectDisclosures. */
export function selectDisclosures(
  credential: SDJWTCredential,
  requestedFields: string[],
): string[] {
  const byField = new Map<string, string>();
  for (const d of credential.disclosures)
    byField.set(decodeDisclosure(d).field, d);
  return requestedFields.map(field => {
    const d = byField.get(field);
    if (d === undefined) throw new DisclosureNotFoundError(field);
    return d;
  });
}

// ─── Key binding ──────────────────────────────────────────────────────────────

/** sd_hash = BASE64URL(SHA-256(<sd_jwt>~<d1>~...~<dn>~)) — trailing "~" per RFC 9901. */
export function computeSdHash(presentation: Presentation): string {
  return sha256Base64url(
    [presentation.sd_jwt, ...presentation.disclosures, ''].join('~'),
  );
}

/**
 * Signs `signingInput` (UTF-8) with RSASSA-PKCS1-v1_5 SHA-256 and returns the
 * signature as base64 or base64url. On the phone: the Keystore key.
 */
export type Rs256Signer = (signingInput: string) => Promise<string>;

/** kb+jwt over the presentation, bound to verifier (aud) and nonce. Same claims as jose SignJWT in webHolder. */
export async function createKeyBinding(params: {
  presentation: Presentation;
  verifierId: string;
  nonce: string;
  sign: Rs256Signer;
  now?: number;
}): Promise<string> {
  const header = { alg: 'RS256', typ: 'kb+jwt' };
  const payload = {
    nonce: params.nonce,
    sd_hash: computeSdHash(params.presentation),
    aud: params.verifierId,
    iat: Math.floor((params.now ?? Date.now()) / 1000),
  };
  const signingInput = `${base64urlEncodeString(JSON.stringify(header))}.${base64urlEncodeString(JSON.stringify(payload))}`;
  const signature = await params.sign(signingInput);
  const sigB64url = signature
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .replace(/\s+/g, '');
  return `${signingInput}.${sigB64url}`;
}

/** Complete Proof for POST /verification/submit-proof. Mirrors generateProof. */
export async function generateProof(params: {
  credential: SDJWTCredential;
  requestedFields: string[];
  verifierId: string;
  nonce: string;
  sign: Rs256Signer;
}): Promise<Proof> {
  const presentation: Presentation = {
    sd_jwt: params.credential.sd_jwt,
    disclosures: selectDisclosures(params.credential, params.requestedFields),
  };
  const keyBinding = await createKeyBinding({
    presentation,
    verifierId: params.verifierId,
    nonce: params.nonce,
    sign: params.sign,
  });
  return {
    presentation,
    key_binding: keyBinding,
    timestamp: new Date().toISOString(),
    verifier_id: params.verifierId,
  };
}
