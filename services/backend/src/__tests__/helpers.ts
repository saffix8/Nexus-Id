/**
 * helpers.ts
 * Test helpers for NexusID integration tests.
 * All crypto operations are REAL — no mocking of SD-JWT primitives.
 */

import {
  generateKeyPair as joseGenerateKeyPair,
  exportPKCS8,
  exportSPKI,
  SignJWT,
} from 'jose';

import { createHash, randomBytes } from 'crypto';

import type {
  SDJWTCredential,
  RawClaim,
  Proof,
  Presentation,
  CredentialMetadata,
} from '@nexusid/types';

// ─────────────────────────────────────────────────────────────
// Key Pair
// ─────────────────────────────────────────────────────────────

export interface TestKeyPair {
  privateKey: string;
  publicKey: string;
}

export async function generateTestKeyPair(): Promise<TestKeyPair> {
  const { publicKey, privateKey } = await joseGenerateKeyPair('RS256', {
    extractable: true,
  });

  return {
    privateKey: await exportPKCS8(privateKey),
    publicKey: await exportSPKI(publicKey),
  };
}

// ─────────────────────────────────────────────────────────────
// Credential
// ─────────────────────────────────────────────────────────────

/**
 * A NADRA-style predicate credential (FR-005): each catalog predicate is a
 * selectively disclosable boolean. AGE_OVER_21 is false on purpose so tests can
 * cover a predicate the credential carries but does not satisfy.
 */
export const DEFAULT_PREDICATE_CLAIMS: RawClaim[] = [
  { field: 'AGE_OVER_18', value: true },
  { field: 'AGE_OVER_21', value: false },
  { field: 'NATIONALITY_PAKISTANI', value: true },
];

export async function generateTestCredential(
  issuerPrivateKey: string,
  holderPublicKey: string,
  overrides: Partial<{
    issuerDID: string;
    keyId: string;
    expiresInDays: number;
    claims: RawClaim[];
  }> = {},
): Promise<SDJWTCredential> {
  const { createCredential } = await import('@nexusid/sd-jwt/issuer');

  const selectiveClaims = overrides.claims ?? DEFAULT_PREDICATE_CLAIMS;

  const alwaysVisibleClaims: Record<string, unknown> = {
    credential_type: 'identity',
    issuer_name: 'NADRA Pakistan',
  };

  const metadata: CredentialMetadata = {
    always_visible_fields: ['credential_type', 'issuer_name'],
    selectively_disclosable_fields: selectiveClaims.map(c => c.field),
    field_labels: {
      AGE_OVER_18: 'Age over 18',
      AGE_OVER_21: 'Age over 21',
      NATIONALITY_PAKISTANI: 'Pakistani national',
      credential_type: 'Credential Type',
      issuer_name: 'Issued By',
    },
  };

  const credential = await createCredential({
    claims: selectiveClaims,
    alwaysVisibleClaims,
    issuerDID: overrides.issuerDID ?? 'nadra.gov.pk',
    holderPublicKey,
    issuerPrivateKey,
    keyId: overrides.keyId ?? 'nadra-test-key-v1',
    expiresInDays: overrides.expiresInDays ?? 365,
  });

  return {
    ...credential,
    metadata,
  };
}

// ─────────────────────────────────────────────────────────────
// Proof
// ─────────────────────────────────────────────────────────────

export async function generateTestProof(
  credential: SDJWTCredential,
  userPrivateKey: string,
  options: {
    requestedFields?: string[];
    verifierId?: string;
    nonce?: string;
    /** Override the key-binding `iat` (seconds since epoch) — for proof-age tests. */
    iat?: number;
  } = {},
): Promise<Proof> {
  const { selectDisclosures } = await import('@nexusid/sd-jwt/holder');
  const { importPKCS8 } = await import('jose');

  const requestedFields =
    options.requestedFields ?? ['AGE_OVER_18'];

  const verifierId =
    options.verifierId ?? 'test-verifier.nexusid.com';

  const nonce =
    options.nonce ?? randomBytes(16).toString('hex');

  const disclosures = selectDisclosures(
    credential,
    requestedFields,
  );

  const presentation: Presentation = {
    sd_jwt: credential.sd_jwt,
    disclosures,
  };

  const presentationString =
    credential.sd_jwt +
    '~' +
    disclosures.join('~') +
    '~';

  const sd_hash = createHash('sha256')
    .update(presentationString)
    .digest('base64url');

  const key = await importPKCS8(userPrivateKey, 'RS256');

  const keyBindingJwt = await new SignJWT({
    aud: verifierId,
    nonce,
    sd_hash,
    iat: options.iat ?? Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'kb+jwt',
    })
    .sign(key);

  return {
    presentation,
    key_binding: keyBindingJwt,
    timestamp: new Date().toISOString(),
    verifier_id: verifierId,
  };
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

export function sha256(input: string): string {
  return createHash('sha256')
    .update(input)
    .digest('hex');
}
