/**
 * packages/sd-jwt/src/holder.ts
 *
 * SD-JWT Holder operations for NexusID.
 * Runs on the mobile app (React Native) and web app (Next.js).
 *
 * Responsibilities:
 *  - Select which disclosures to reveal for a given verification request
 *  - Create a Key Binding JWT (kb+jwt) proving the holder controls the credential
 *  - Assemble a complete Proof object ready to submit to the backend
 *  - Decode individual disclosures for UI display
 *
 * Standard: IETF SD-JWT (RFC 9901 / SD-JWT VC draft)
 */

import { SignJWT, importPKCS8, base64url } from 'jose';
import { createHash } from 'crypto';
import type {
  SDJWTCredential,
  Presentation,
  Proof,
} from '@nexusid/types';

// ─── Typed Error Classes ──────────────────────────────────────────────────────

/**
 * Thrown when a requested field is not present in the credential's disclosures.
 */
export class DisclosureNotFoundError extends Error {
  public readonly field: string;

  constructor(field: string) {
    super(
      `Requested field "${field}" is not available in the credential's disclosures. ` +
      `Ensure the credential was issued with this field as a selective claim.`
    );
    this.name = 'DisclosureNotFoundError';
    this.field = field;
  }
}

/**
 * Thrown when a disclosure string cannot be decoded from base64url JSON.
 */
export class MalformedDisclosureError extends Error {
  public readonly disclosure: string;

  constructor(disclosure: string, cause?: unknown) {
    super(
      `Failed to decode disclosure. ` +
      `Expected base64url-encoded JSON array [salt, field, value]. ` +
      `Disclosure: "${disclosure.slice(0, 32)}..."`
    );
    this.name = 'MalformedDisclosureError';
    this.disclosure = disclosure;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

/**
 * Thrown when key binding JWT creation fails (e.g. invalid private key PEM).
 */
export class KeyBindingError extends Error {
  constructor(message: string, cause?: unknown) {
    super(`Key binding failed: ${message}`);
    this.name = 'KeyBindingError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

/**
 * Thrown when a proof cannot be assembled (missing credential data, etc.).
 */
export class ProofGenerationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(`Proof generation failed: ${message}`);
    this.name = 'ProofGenerationError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Decoded representation of a single disclosure array [salt, field, value].
 */
interface DecodedDisclosure {
  salt: string;
  field: string;
  value: unknown;
}

/**
 * Decode a base64url disclosure string into its constituent parts.
 * Shared by decodeDisclosure (public) and selectDisclosures (internal).
 *
 * Throws MalformedDisclosureError for any invalid input.
 */
function decodeDisclosureInternal(disclosure: string): DecodedDisclosure {
  let json: string;
  try {
    json = new TextDecoder().decode(base64url.decode(disclosure));
  } catch (err) {
    throw new MalformedDisclosureError(disclosure, err);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new MalformedDisclosureError(disclosure, err);
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string'
  ) {
    throw new MalformedDisclosureError(disclosure);
  }

  return {
    salt:  parsed[0] as string,
    field: parsed[1] as string,
    value: parsed[2],
  };
}

/**
 * Compute the sd_hash as specified by the SD-JWT key binding section.
 *
 * sd_hash = BASE64URL(SHA-256(presentation_string))
 * where presentation_string = sd_jwt + "~" + disclosure_1 + "~" + ... + "~"
 *
 * The trailing "~" is required by the spec even when there are no disclosures.
 */
function computeSdHash(presentation: Presentation): string {
  const { sd_jwt, disclosures } = presentation;

  // Build the combined string exactly as the spec requires:
  // <Issuer-signed JWT>~<Disclosure 1>~<Disclosure 2>~...~
  const parts = [sd_jwt, ...disclosures, ''];
  const presentationString = parts.join('~');

  const hashBuffer = createHash('sha256')
    .update(presentationString, 'utf8')
    .digest();

  // base64url encode without padding
  return base64url.encode(hashBuffer);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Select only the disclosures corresponding to the requested fields.
 *
 * @param credential  - The stored SDJWTCredential (contains all disclosures)
 * @param requestedFields - Field names the verifier is asking for
 * @returns Array of base64url-encoded disclosure strings for the requested fields only
 * @throws DisclosureNotFoundError if any requested field is absent from the credential
 * @throws MalformedDisclosureError if any stored disclosure cannot be decoded
 */
export function selectDisclosures(
  credential: SDJWTCredential,
  requestedFields: string[],
): string[] {
  if (requestedFields.length === 0) {
    return [];
  }

  // Build a map of field → disclosure string from all stored disclosures
  const fieldToDisclosure = new Map<string, string>();

  for (const disclosure of credential.disclosures) {
    // decodeDisclosureInternal throws MalformedDisclosureError on bad input
    const decoded = decodeDisclosureInternal(disclosure);
    fieldToDisclosure.set(decoded.field, disclosure);
  }

  // For each requested field, find the matching disclosure
  const selected: string[] = [];

  for (const field of requestedFields) {
    const disclosure = fieldToDisclosure.get(field);
    if (disclosure === undefined) {
      throw new DisclosureNotFoundError(field);
    }
    selected.push(disclosure);
  }

  return selected;
}

/**
 * Create a Key Binding JWT (kb+jwt) that binds this presentation to the
 * specific verifier and nonce, proving the holder controls the credential.
 *
 * The kb+jwt header uses typ: "kb+jwt" per the SD-JWT spec.
 * The payload contains:
 *   - iat   : current Unix timestamp (seconds)
 *   - aud   : verifierId (audience — who this proof is for)
 *   - nonce : from the verification request (replay prevention)
 *   - sd_hash: SHA-256 of the full presentation string
 *
 * @param params.presentation   - The Presentation object (sd_jwt + selected disclosures)
 * @param params.verifierId     - Verifier domain / ID (becomes the `aud` claim)
 * @param params.nonce          - One-time nonce from the verification request
 * @param params.userPrivateKey - RSA-2048 private key PEM from Android Keystore / iOS Keychain
 * @returns Compact JWT string (header.payload.signature)
 * @throws KeyBindingError if signing fails for any reason
 */
export async function createKeyBinding(params: {
  presentation: Presentation;
  verifierId: string;
  nonce: string;
  userPrivateKey: string;
}): Promise<string> {
  const { presentation, verifierId, nonce, userPrivateKey } = params;

  const sdHash = computeSdHash(presentation);

  let privateKey: CryptoKey;
  try {
    privateKey = await importPKCS8(userPrivateKey, 'RS256');
  } catch (err) {
    throw new KeyBindingError(
      'Failed to import user private key. Ensure it is a valid PKCS#8 PEM-encoded RSA-2048 key.',
      err,
    );
  }

  let compact: string;
  try {
    compact = await new SignJWT({
      nonce,
      sd_hash: sdHash,
    })
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'kb+jwt',
      })
      .setAudience(verifierId)
      .setIssuedAt()        // iat = Math.floor(Date.now() / 1000)
      .sign(privateKey);
  } catch (err) {
    throw new KeyBindingError('JWT signing failed.', err);
  }

  return compact;
}

/**
 * Generate a complete Proof object ready to POST to
 * POST /api/v1/verification/submit-proof.
 *
 * Steps:
 *  1. Select only the requested disclosures from the credential
 *  2. Build a Presentation (sd_jwt + selected disclosures)
 *  3. Create a Key Binding JWT over that presentation
 *  4. Return the assembled Proof
 *
 * @throws DisclosureNotFoundError if the credential lacks a requested field
 * @throws KeyBindingError if the key binding JWT cannot be created
 * @throws ProofGenerationError for any other unexpected failure
 */
export async function generateProof(params: {
  credential: SDJWTCredential;
  requestedFields: string[];
  verifierId: string;
  nonce: string;
  userPrivateKey: string;
}): Promise<Proof> {
  const {
    credential,
    requestedFields,
    verifierId,
    nonce,
    userPrivateKey,
  } = params;

  // Step 1: Select disclosures — throws DisclosureNotFoundError on missing field
  let selectedDisclosures: string[];
  try {
    selectedDisclosures = selectDisclosures(credential, requestedFields);
  } catch (err) {
    // Re-throw typed errors as-is; anything else wraps into ProofGenerationError
    if (
      err instanceof DisclosureNotFoundError ||
      err instanceof MalformedDisclosureError
    ) {
      throw err;
    }
    throw new ProofGenerationError(
      'Unexpected error while selecting disclosures.',
      err,
    );
  }

  // Step 2: Build Presentation
  const presentation: Presentation = {
    sd_jwt:       credential.sd_jwt,
    disclosures:  selectedDisclosures,
  };

  // Step 3: Create Key Binding JWT — throws KeyBindingError on failure
  const keyBinding = await createKeyBinding({
    presentation,
    verifierId,
    nonce,
    userPrivateKey,
  });

  // Step 4: Assemble and return the Proof
  const proof: Proof = {
    presentation,
    key_binding: keyBinding,
    timestamp:   new Date().toISOString(),
    verifier_id: verifierId,
  };

  return proof;
}

/**
 * Decode a single base64url disclosure string for display in the UI.
 *
 * Used by mobile/web screens to show the user what each field and value is
 * before they decide which ones to share.
 *
 * @param disclosure - base64url-encoded JSON array "[salt, field, value]"
 * @returns An object with salt, field name, and the claim value
 * @throws MalformedDisclosureError if the disclosure cannot be decoded
 */
export function decodeDisclosure(disclosure: string): {
  salt: string;
  field: string;
  value: unknown;
} {
  return decodeDisclosureInternal(disclosure);
}
