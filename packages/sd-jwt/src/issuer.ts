/**
 * NexusID — SD-JWT Issuer
 * Implements SD-JWT credential issuance per IETF RFC 9901
 *
 * Used by: NADRA, HEC, Air University, and LinkedIn issuer microservices
 */

import { SignJWT, generateKeyPair, exportPKCS8, exportSPKI, importPKCS8 } from 'jose';
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// ─── Type Imports ────────────────────────────────────────────────────────────
// Inline type definitions matching @nexusid/types (used here to keep the
// library self-contained; consumers should import from @nexusid/types)

export type CredentialType = 'identity' | 'education' | 'employment' | 'enrollment';
export type CredentialStatus = 'active' | 'expired' | 'revoked';

export interface RawClaim {
  field: string;
  value: string | number | boolean;
}

export interface CredentialMetadata {
  always_visible_fields: string[];
  selectively_disclosable_fields: string[];
  field_labels: Record<string, string>;
}

export interface SDJWTCredential {
  id: string;
  type: CredentialType;
  issuer: string;
  subject: string;
  sd_jwt: string;
  disclosures: string[];
  issued_at: string;
  expires_at: string;
  metadata: CredentialMetadata;
}

// ─── Custom Error Types ──────────────────────────────────────────────────────

export class SDJWTIssuanceError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SDJWTIssuanceError';
  }
}

export class InvalidPrivateKeyError extends SDJWTIssuanceError {
  constructor(cause?: unknown) {
    super('Failed to import issuer private key. Ensure it is a valid RSA PEM string.', cause);
    this.name = 'InvalidPrivateKeyError';
  }
}

export class KeyGenerationError extends SDJWTIssuanceError {
  constructor(cause?: unknown) {
    super('Failed to generate RSA key pair.', cause);
    this.name = 'KeyGenerationError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Encode a value to base64url (no padding).
 */
function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * SHA-256 hash a string, return base64url-encoded digest.
 */
function sha256Base64url(input: string): string {
  const hash = createHash('sha256').update(input).digest();
  return base64urlEncode(hash);
}

/**
 * Derive the CredentialType from the alwaysVisibleClaims credential_type field,
 * falling back to 'identity' if not present or unrecognised.
 */
function resolveCredentialType(
  alwaysVisibleClaims: Record<string, unknown>,
): CredentialType {
  const t = alwaysVisibleClaims['credential_type'];
  if (
    t === 'identity' ||
    t === 'education' ||
    t === 'employment' ||
    t === 'enrollment'
  ) {
    return t;
  }
  return 'identity';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create SD-JWT disclosures for a list of selectively-disclosable claims.
 *
 * Per RFC 9901 §5.2.1, each disclosure is:
 *   base64url( JSON( [salt, claim_name, claim_value] ) )
 *
 * The _sd array in the JWT payload contains SHA-256 hashes of each disclosure.
 *
 * @param claims  Array of { field, value } objects to make selectively disclosable.
 * @returns       { disclosures, hashedClaims } where:
 *                  disclosures  — base64url-encoded disclosure strings (sent to holder)
 *                  hashedClaims — SHA-256 hashes of disclosures (stored in JWT _sd)
 */
export function createDisclosures(claims: RawClaim[]): {
  disclosures: string[];
  hashedClaims: string[];
} {
  const disclosures: string[] = [];
  const hashedClaims: string[] = [];

  for (const claim of claims) {
    // 16 random bytes → base64url salt (RFC 9901 §11.3 recommends ≥ 128 bits)
    const salt = base64urlEncode(randomBytes(16));

    // Disclosure array: [salt, field_name, field_value]
    const disclosureArray: [string, string, string | number | boolean] = [
      salt,
      claim.field,
      claim.value,
    ];

    const disclosureJson = JSON.stringify(disclosureArray);
    const disclosure = base64urlEncode(disclosureJson);

    disclosures.push(disclosure);
    hashedClaims.push(sha256Base64url(disclosure));
  }

  return { disclosures, hashedClaims };
}

// ─── createCredential params ──────────────────────────────────────────────────

export interface CreateCredentialParams {
  /** Selectively disclosable claims (hashed into _sd). */
  claims: RawClaim[];
  /** Claims always visible to verifiers (merged into JWT payload directly). */
  alwaysVisibleClaims: Record<string, unknown>;
  /** Issuer DID / domain — e.g. "nadra.gov.pk". Becomes the JWT `iss` claim. */
  issuerDID: string;
  /** Subject identifier — e.g. CNIC or degree number. Becomes JWT `sub`. */
  subject: string;
  /** RSA-2048 private key in PKCS#8 PEM format. */
  issuerPrivateKey: string;
  /** Key ID placed in JWT `kid` header. */
  keyId: string;
  /** Credential validity in days (default: 365). */
  expiresInDays?: number;
  /**
   * Optional metadata for the credential wallet UI.
   * If omitted, metadata is derived from claims and alwaysVisibleClaims.
   */
  metadata?: CredentialMetadata;
}

/**
 * Issue a signed SD-JWT credential.
 *
 * Flow:
 *  1. Create disclosures for all selectively-disclosable claims.
 *  2. Build JWT payload: standard claims + alwaysVisibleClaims + _sd array.
 *  3. Sign with RS256 using the issuer's private key.
 *  4. Return an SDJWTCredential containing the compact JWT and raw disclosures.
 *
 * The final SD-JWT presentation (during verification) is formed as:
 *   <sd_jwt>~<disclosure_1>~<disclosure_2>~...~<kb_jwt>
 * — but that concatenation happens in the holder (holder.ts), not here.
 */
export async function createCredential(
  params: CreateCredentialParams,
): Promise<SDJWTCredential> {
  const {
    claims,
    alwaysVisibleClaims,
    issuerDID,
    subject,
    issuerPrivateKey,
    keyId,
    expiresInDays = 365,
  } = params;

  // 1. Generate disclosures
  const { disclosures, hashedClaims } = createDisclosures(claims);

  // 2. Time bounds
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInDays * 24 * 60 * 60;

  // 3. Build JWT payload
  //    _sd_alg is REQUIRED by RFC 9901 §5.2.1 when _sd is present
  const payload: Record<string, unknown> = {
    // Standard JWT claims
    iss: issuerDID,
    sub: subject,
    iat: now,
    nbf: now,
    exp,
    jti: uuidv4(),

    // SD-JWT specific
    _sd: hashedClaims,
    _sd_alg: 'sha-256',

    // cnf (confirmation) — populated with holder's public key during issuance
    // in a production flow; left as an empty object here for the demo/FYP scope.
    cnf: {},

    // Always-visible claims spread directly into payload
    ...alwaysVisibleClaims,
  };

  // 4. Import private key
  let privateKey: CryptoKey;
  try {
    privateKey = await importPKCS8(issuerPrivateKey, 'RS256');
  } catch (err) {
    throw new InvalidPrivateKeyError(err);
  }

  // 5. Sign
  let sdJwt: string;
  try {
    sdJwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'vc+sd-jwt', kid: keyId })
      .sign(privateKey);
  } catch (err) {
    throw new SDJWTIssuanceError('Failed to sign SD-JWT credential.', err);
  }

  // 6. Derive metadata if not supplied
  const credentialType = resolveCredentialType(alwaysVisibleClaims);
  const alwaysVisibleKeys = Object.keys(alwaysVisibleClaims);
  const selectiveKeys = claims.map((c) => c.field);

  const derivedFieldLabels: Record<string, string> = {};
  for (const key of [...alwaysVisibleKeys, ...selectiveKeys]) {
    // Convert snake_case to Title Case for display labels
    derivedFieldLabels[key] = key
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  const metadata: CredentialMetadata = params.metadata ?? {
    always_visible_fields: alwaysVisibleKeys,
    selectively_disclosable_fields: selectiveKeys,
    field_labels: derivedFieldLabels,
  };

  // 7. Build SDJWTCredential
  const issuedAt = new Date(now * 1000).toISOString();
  const expiresAt = new Date(exp * 1000).toISOString();

  const credential: SDJWTCredential = {
    id: uuidv4(),
    type: credentialType,
    issuer: issuerDID,
    subject,
    sd_jwt: sdJwt,
    disclosures,
    issued_at: issuedAt,
    expires_at: expiresAt,
    metadata,
  };

  return credential;
}

/**
 * Generate an RSA-2048 key pair for an issuer service.
 *
 * The private key should be stored securely (e.g. in .issuer-private-key.pem).
 * The public key should be registered in the backend's issuer_registry table
 * and exposed via GET /.well-known/jwks.json.
 *
 * @returns { privateKey, publicKey } both in PEM format.
 */
export async function generateIssuerKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  let keyPair: {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};
  try {
    keyPair = await generateKeyPair('RS256', {
      modulusLength: 2048,
      extractable: true,
    });
  } catch (err) {
    throw new KeyGenerationError(err);
  }

  const [privateKeyPem, publicKeyPem] = await Promise.all([
    exportPKCS8(keyPair.privateKey),
    exportSPKI(keyPair.publicKey),
  ]);

  return { privateKey: privateKeyPem, publicKey: publicKeyPem };
}
