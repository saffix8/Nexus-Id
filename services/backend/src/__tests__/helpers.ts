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

export async function generateTestCredential(
  issuerPrivateKey: string,
  overrides: Partial<{
    subject: string;
    issuerDID: string;
    keyId: string;
    expiresInDays: number;
  }> = {},
): Promise<SDJWTCredential> {
  const { createCredential } = await import('@nexusid/sd-jwt/issuer');

  const selectiveClaims: RawClaim[] = [
    { field: 'student_name', value: 'Ahmed Ali Khan' },
    { field: 'degree_title', value: 'BS Computer Science' },
    { field: 'university', value: 'Air University Islamabad' },
    { field: 'registration_number', value: 'FA19-BCS-101' },
    { field: 'year_of_award', value: 2024 },
  ];

  const alwaysVisibleClaims: Record<string, unknown> = {
    credential_type: 'education',
    issuer_name: 'Higher Education Commission Pakistan',
    verified: true,
  };

  const metadata: CredentialMetadata = {
    always_visible_fields: [
      'credential_type',
      'issuer_name',
      'verified',
    ],
    selectively_disclosable_fields: selectiveClaims.map(c => c.field),
    field_labels: {
      student_name: 'Full Name',
      degree_title: 'Degree',
      university: 'University',
      registration_number: 'Registration No.',
      year_of_award: 'Year of Award',
      credential_type: 'Credential Type',
      issuer_name: 'Issued By',
      verified: 'Verified',
    },
  };

  const credential = await createCredential({
    claims: selectiveClaims,
    alwaysVisibleClaims,
    issuerDID: overrides.issuerDID ?? 'hec.gov.pk',
    subject: overrides.subject ?? 'FA19-BCS-101',
    issuerPrivateKey,
    keyId: overrides.keyId ?? 'hec-test-key-v1',
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
  } = {},
): Promise<Proof> {
  const { selectDisclosures } = await import('@nexusid/sd-jwt/holder');
  const { importPKCS8 } = await import('jose');

  const requestedFields =
    options.requestedFields ?? ['degree_title', 'university'];

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
    iat: Math.floor(Date.now() / 1000),
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
