import { createHash } from 'crypto';
import { importSPKI, jwtVerify, decodeProtectedHeader } from 'jose';
import type { Presentation, Proof } from '@nexusid/types';

// ─── Typed Error Classes ──────────────────────────────────────────────────────

export class VerifierError extends Error {
  constructor(
    message: string,
    public readonly code: VerifierErrorCode,
  ) {
    super(message);
    this.name = 'VerifierError';
  }
}

export type VerifierErrorCode =
  | 'INVALID_ISSUER_SIGNATURE'
  | 'EXPIRED_CREDENTIAL'
  | 'INVALID_DISCLOSURE_HASH'
  | 'DISCLOSURE_DECODE_FAILED'
  | 'MISSING_SD_ARRAY'
  | 'INVALID_KEY_BINDING_SIGNATURE'
  | 'KEY_BINDING_AUD_MISMATCH'
  | 'KEY_BINDING_NONCE_MISMATCH'
  | 'KEY_BINDING_SD_HASH_MISMATCH'
  | 'INVALID_KEY_BINDING_FORMAT'
  | 'INVALID_PUBLIC_KEY'
  | 'PROOF_VERIFICATION_FAILED';

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * SHA-256 a string and return the result as base64url (no padding).
 */
function sha256Base64url(input: string): string {
  return createHash('sha256')
    .update(input, 'utf8')
    .digest('base64url');
}

/**
 * Compute the sd_hash that is embedded in a key-binding JWT.
 * Defined as SHA-256( sd_jwt + "~" + disclosure_1 + "~" + ... + "~" )
 * The trailing "~" is part of the spec (RFC 9901 §6.2).
 */
function computeSdHash(presentation: Presentation): string {
  const combined =
    presentation.sd_jwt +
    '~' +
    presentation.disclosures.join('~') +
    (presentation.disclosures.length > 0 ? '~' : '');
  return sha256Base64url(combined);
}

/**
 * Decode a single base64url-encoded disclosure into [salt, field, value].
 * A disclosure is: base64url( JSON( [salt, field_name, field_value] ) )
 */
function decodeDisclosure(disclosure: string): { salt: string; field: string; value: unknown } {
  let json: string;
  try {
    json = Buffer.from(disclosure, 'base64url').toString('utf8');
  } catch {
    throw new VerifierError(
      `Failed to base64url-decode disclosure: ${disclosure.slice(0, 20)}...`,
      'DISCLOSURE_DECODE_FAILED',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new VerifierError(
      `Disclosure is not valid JSON after decoding`,
      'DISCLOSURE_DECODE_FAILED',
    );
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string'
  ) {
    throw new VerifierError(
      `Disclosure array must be [salt: string, field: string, value: unknown]`,
      'DISCLOSURE_DECODE_FAILED',
    );
  }

  return { salt: parsed[0], field: parsed[1], value: parsed[2] };
}

// ─── 1. verifyIssuerSignature ─────────────────────────────────────────────────

export interface IssuerSignatureResult {
  valid: boolean;
  payload: Record<string, unknown>;
  issuer: string;
  error?: string;
}

/**
 * Verifies the issuer's RS256 signature on the SD-JWT and checks expiry.
 *
 * @param sd_jwt   The compact JWT string (header.payload.signature).
 * @param issuerPublicKey  RSA public key in PEM (SPKI) format.
 */
export async function verifyIssuerSignature(
  sd_jwt: string,
  issuerPublicKey: string,
): Promise<IssuerSignatureResult> {
  let publicKey: Awaited<ReturnType<typeof importSPKI>>;

  try {
    publicKey = await importSPKI(issuerPublicKey, 'RS256');
  } catch (err) {
    return {
      valid: false,
      payload: {},
      issuer: '',
      error: `Failed to import issuer public key: ${(err as Error).message}`,
    };
  }

  try {
    const { payload } = await jwtVerify(sd_jwt, publicKey, {
      algorithms: ['RS256'],
    });

    const issuer = typeof payload.iss === 'string' ? payload.iss : '';

    return {
      valid: true,
      payload: payload as Record<string, unknown>,
      issuer,
    };
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown verification error';
    const isExpired = message.toLowerCase().includes('exp');

    return {
      valid: false,
      payload: {},
      issuer: '',
      error: isExpired
        ? `Credential has expired: ${message}`
        : `Issuer signature verification failed: ${message}`,
    };
  }
}

// ─── 2. verifyDisclosures ─────────────────────────────────────────────────────

export interface DisclosureVerificationResult {
  valid: boolean;
  verifiedClaims: Record<string, unknown>;
  error?: string;
}

/**
 * Verifies that each disclosure hashes to a value present in payload._sd,
 * then decodes each disclosure to extract { field: value } pairs.
 *
 * @param disclosures  Array of base64url-encoded disclosure strings.
 * @param payload      Decoded JWT payload containing the _sd array.
 */
export function verifyDisclosures(
  disclosures: string[],
  payload: Record<string, unknown>,
): DisclosureVerificationResult {
  // _sd must be a non-empty array of base64url strings
  const sdArray = payload['_sd'];
  if (!Array.isArray(sdArray)) {
    return {
      valid: false,
      verifiedClaims: {},
      error: `Payload missing '_sd' array — cannot verify disclosures`,
    };
  }

  const sdSet = new Set<string>(sdArray as string[]);
  const verifiedClaims: Record<string, unknown> = {};

  for (const disclosure of disclosures) {
    // 1. Hash the disclosure and check it is committed to in _sd
    const hash = sha256Base64url(disclosure);
    if (!sdSet.has(hash)) {
      return {
        valid: false,
        verifiedClaims: {},
        error: `Disclosure hash '${hash}' not found in _sd — possible tampering`,
      };
    }

    // 2. Decode disclosure to extract field name + value
    let decoded: ReturnType<typeof decodeDisclosure>;
    try {
      decoded = decodeDisclosure(disclosure);
    } catch (err) {
      return {
        valid: false,
        verifiedClaims: {},
        error: (err as VerifierError).message,
      };
    }

    verifiedClaims[decoded.field] = decoded.value;
  }

  return { valid: true, verifiedClaims };
}

// ─── 3. verifyKeyBinding ──────────────────────────────────────────────────────

export interface KeyBindingVerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Verifies the holder's key-binding JWT (kb+jwt).
 *
 * Checks:
 *   - RS256 signature against the user's public key
 *   - aud === expectedAud
 *   - nonce === expectedNonce
 *   - sd_hash === SHA-256 of the presentation token string
 *
 * @param keyBinding    Compact kb+jwt string.
 * @param presentation  The Presentation object (sd_jwt + disclosures).
 * @param params        Expected aud, nonce, and the user's RSA public key PEM.
 */
export async function verifyKeyBinding(
  keyBinding: string,
  presentation: Presentation,
  params: {
    expectedAud: string;
    expectedNonce: string;
    userPublicKey: string;
  },
): Promise<KeyBindingVerificationResult> {
  // 1. Validate the typ header is "kb+jwt"
  let header: Record<string, unknown>;
  try {
    header = decodeProtectedHeader(keyBinding) as Record<string, unknown>;
  } catch (err) {
    return {
      valid: false,
      error: `Failed to decode key-binding JWT header: ${(err as Error).message}`,
    };
  }

  if (header['typ'] !== 'kb+jwt') {
    return {
      valid: false,
      error: `Key-binding JWT typ must be 'kb+jwt', got '${header['typ']}'`,
    };
  }

  // 2. Import the user's public key
  let publicKey: Awaited<ReturnType<typeof importSPKI>>;
  try {
    publicKey = await importSPKI(params.userPublicKey, 'RS256');
  } catch (err) {
    return {
      valid: false,
      error: `Failed to import user public key: ${(err as Error).message}`,
    };
  }

  // 3. Verify the RS256 signature (jose also checks exp/nbf if present)
  let kbPayload: Record<string, unknown>;
  try {
    const result = await jwtVerify(keyBinding, publicKey, {
      algorithms: ['RS256'],
      typ: 'kb+jwt',
    });
    kbPayload = result.payload as Record<string, unknown>;
  } catch (err) {
    return {
      valid: false,
      error: `Key-binding signature verification failed: ${(err as Error).message}`,
    };
  }

  // 4. aud check
  if (kbPayload['aud'] !== params.expectedAud) {
    return {
      valid: false,
      error: `Key-binding aud mismatch — expected '${params.expectedAud}', got '${String(kbPayload['aud'])}'`,
    };
  }

  // 5. nonce check
  if (kbPayload['nonce'] !== params.expectedNonce) {
    return {
      valid: false,
      error: `Key-binding nonce mismatch — possible replay attack`,
    };
  }

  // 6. sd_hash check
  const expectedSdHash = computeSdHash(presentation);
  if (kbPayload['sd_hash'] !== expectedSdHash) {
    return {
      valid: false,
      error: `Key-binding sd_hash mismatch — presentation may have been tampered`,
    };
  }

  return { valid: true };
}

// ─── 4. verifyProof ───────────────────────────────────────────────────────────

export interface ProofVerificationResult {
  valid: boolean;
  verifiedFields: Record<string, unknown>;
  issuer: string;
  error?: string;
}

/**
 * Full proof verification pipeline.
 *
 * Steps (short-circuit on first failure):
 *   1. Verify the issuer's signature on the SD-JWT.
 *   2. Verify each disclosure hashes to a committed _sd value and decode claims.
 *   3. Verify the holder's key-binding JWT (aud, nonce, sd_hash, signature).
 *
 * @param proof   The Proof object from the mobile app.
 * @param params  Public keys and expected aud/nonce from the verification request.
 */
export async function verifyProof(
  proof: Proof,
  params: {
    issuerPublicKey: string;
    userPublicKey: string;
    expectedNonce: string;
    verifierId: string;
  },
): Promise<ProofVerificationResult> {
  const { presentation, key_binding } = proof;

  // ── Step 1: Issuer signature ─────────────────────────────────────────────
  const issuerResult = await verifyIssuerSignature(
    presentation.sd_jwt,
    params.issuerPublicKey,
  );

  if (!issuerResult.valid) {
    return {
      valid: false,
      verifiedFields: {},
      issuer: '',
      error: issuerResult.error,
    };
  }

  // ── Step 2: Disclosure verification ─────────────────────────────────────
  const disclosureResult = verifyDisclosures(
    presentation.disclosures,
    issuerResult.payload,
  );

  if (!disclosureResult.valid) {
    return {
      valid: false,
      verifiedFields: {},
      issuer: issuerResult.issuer,
      error: disclosureResult.error,
    };
  }

  // ── Step 3: Key-binding verification ─────────────────────────────────────
  const kbResult = await verifyKeyBinding(key_binding, presentation, {
    expectedAud: params.verifierId,
    expectedNonce: params.expectedNonce,
    userPublicKey: params.userPublicKey,
  });

  if (!kbResult.valid) {
    return {
      valid: false,
      verifiedFields: {},
      issuer: issuerResult.issuer,
      error: kbResult.error,
    };
  }

  // ── All checks passed ─────────────────────────────────────────────────────
  return {
    valid: true,
    verifiedFields: disclosureResult.verifiedClaims,
    issuer: issuerResult.issuer,
  };
}
