/**
 * apps/mobile/src/services/crypto.service.ts
 *
 * Mobile cryptography layer — bridges the SD-JWT library with the Android Keystore.
 * All signing is delegated to KeystoreService so private keys never leave secure hardware.
 */

import { selectDisclosures, decodeDisclosure } from '@nexusid/sd-jwt/holder';
import { verifyIssuerSignature } from '@nexusid/sd-jwt/verifier';
import type {
  SDJWTCredential,
  Proof,
  Presentation,
  IssuerID,
} from '@nexusid/types';
import { KeystoreService } from './keystore.service';
import { API_BASE_URL } from '../config';

// ─── Error Types ────────────────────────────────────────────────────────────

export class CryptoServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CryptoServiceError';
  }
}

export class DisclosureSelectionError extends CryptoServiceError {
  constructor(missingFields: string[]) {
    super(
      `Credential does not contain the following requested fields: ${missingFields.join(', ')}`,
    );
    this.name = 'DisclosureSelectionError';
  }
}

export class SigningError extends CryptoServiceError {
  constructor(cause?: unknown) {
    super('Failed to sign key binding — biometric auth may have been cancelled', cause);
    this.name = 'SigningError';
  }
}

export class IssuerKeyFetchError extends CryptoServiceError {
  constructor(issuerId: string, cause?: unknown) {
    super(`Failed to fetch public key for issuer: ${issuerId}`, cause);
    this.name = 'IssuerKeyFetchError';
  }
}

export class SignatureVerificationError extends CryptoServiceError {
  constructor(cause?: unknown) {
    super('Issuer signature verification failed', cause);
    this.name = 'SignatureVerificationError';
  }
}

export class DecodeError extends CryptoServiceError {
  constructor(cause?: unknown) {
    super('Failed to decode credential disclosures for display', cause);
    this.name = 'DecodeError';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Base64url-encode a string (no padding).
 * Used to manually construct the kb+jwt header and payload segments.
 */
function base64urlEncode(input: string): string {
  // React Native's btoa operates on binary strings; encode via UTF-8
  const bytes = unescape(encodeURIComponent(input));
  return btoa(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64url-decode a string.
 */
function base64urlDecode(input: string): string {
  // Re-pad to a multiple of 4 for atob
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddingNeeded = (4 - (padded.length % 4)) % 4;
  const padded2 = padded + '='.repeat(paddingNeeded);
  return decodeURIComponent(escape(atob(padded2)));
}

/**
 * SHA-256 hash a string, returning a hex string.
 * Uses the Web Crypto API available in React Native's Hermes engine (RN 0.70+).
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Key Binding JWT Payload ─────────────────────────────────────────────────

interface KeyBindingPayload {
  iat: number;
  aud: string;
  nonce: string;
  sd_hash: string;
}

// ─── CryptoService ───────────────────────────────────────────────────────────

class CryptoService {
  private readonly keystoreService: KeystoreService;

  constructor() {
    this.keystoreService = KeystoreService.getInstance();
  }

  // ── 1. generateProofForVerification ────────────────────────────────────────

  /**
   * Generates a selective-disclosure proof for a verification request.
   *
   * Flow:
   *   1. Select only the disclosed claims the verifier asked for.
   *   2. Build a Presentation (sd_jwt + chosen disclosures).
   *   3. Compute sd_hash over the presentation string.
   *   4. Build a kb+jwt payload and sign it with the user's hardware-backed key.
   *   5. Assemble the final Proof object.
   */
  async generateProofForVerification(params: {
    credential: SDJWTCredential;
    requestedFields: string[];
    verifierId: string;
    nonce: string;
    userId: string;
  }): Promise<Proof> {
    const { credential, requestedFields, verifierId, nonce, userId } = params;

    // ── Step 1: Select the disclosures for the requested fields ──────────────
    let selectedDisclosures: string[];
    try {
      selectedDisclosures = selectDisclosures(credential, requestedFields);
    } catch (err) {
      // Re-surface DisclosureNotFoundError from the sd-jwt library with richer context
      throw new DisclosureSelectionError(requestedFields);
    }

    // ── Step 2: Build Presentation ───────────────────────────────────────────
    const presentation: Presentation = {
      sd_jwt: credential.sd_jwt,
      disclosures: selectedDisclosures,
    };

    // ── Step 3: Compute sd_hash ──────────────────────────────────────────────
    // sd_hash = SHA-256 of: <sd_jwt>~<disc1>~<disc2>~...~
    // The trailing "~" is per the SD-JWT spec (§ 6.2).
    const presentationString =
      credential.sd_jwt +
      '~' +
      selectedDisclosures.join('~') +
      (selectedDisclosures.length > 0 ? '~' : '');

    let sdHash: string;
    try {
      sdHash = await sha256Hex(presentationString);
    } catch (err) {
      throw new CryptoServiceError('Failed to compute sd_hash', err);
    }

    // ── Step 4: Build kb+jwt and sign via Keystore ───────────────────────────
    const kbHeader = {
      alg: 'RS256',
      typ: 'kb+jwt',
    };

    const kbPayload: KeyBindingPayload = {
      iat: Math.floor(Date.now() / 1000),
      aud: verifierId,
      nonce,
      sd_hash: sdHash,
    };

    const headerB64 = base64urlEncode(JSON.stringify(kbHeader));
    const payloadB64 = base64urlEncode(JSON.stringify(kbPayload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // KeystoreService.signData triggers biometric prompt and returns a base64 signature
    let signatureB64: string;
    try {
      signatureB64 = await this.keystoreService.signData(userId, signingInput);
    } catch (err) {
      throw new SigningError(err);
    }

    // Convert standard base64 signature to base64url (KeystoreService returns plain base64)
    const signatureB64url = signatureB64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const keyBinding = `${signingInput}.${signatureB64url}`;

    // ── Step 5: Assemble Proof ───────────────────────────────────────────────
    const proof: Proof = {
      presentation,
      key_binding: keyBinding,
      timestamp: new Date().toISOString(),
      verifier_id: verifierId,
    };

    return proof;
  }

  // ── 2. validateCredentialSignature ─────────────────────────────────────────

  /**
   * Validates the issuer's RSA signature on the credential's SD-JWT.
   *
   * Fetches the issuer's public key from the backend and delegates verification
   * to the shared sd-jwt library.
   */
  async validateCredentialSignature(credential: SDJWTCredential): Promise<boolean> {
    const issuerId = credential.issuer as IssuerID;

    // Fetch issuer public key from backend
    let issuerPublicKey: string;
    try {
      const response = await fetch(
        `${API_BASE_URL}/issuers/${encodeURIComponent(issuerId)}/public-key`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as { data: { public_key: string } };
      issuerPublicKey = json.data.public_key;

      if (!issuerPublicKey) {
        throw new Error('Response did not contain a public key');
      }
    } catch (err) {
      throw new IssuerKeyFetchError(issuerId, err);
    }

    // Delegate signature verification to the sd-jwt library
    try {
      const result = await verifyIssuerSignature(credential.sd_jwt, issuerPublicKey);
      return result.valid;
    } catch (err) {
      throw new SignatureVerificationError(err);
    }
  }

  // ── 3. decodeCredentialForDisplay ──────────────────────────────────────────

  /**
   * Decodes a stored credential into a flat { field: value } map for display
   * in the UI (e.g. VerificationApprovalScreen, HistoryScreen).
   *
   * Merges:
   *   - Always-visible claims extracted from the JWT payload body.
   *   - All selectively-disclosable claims decoded from the raw disclosures.
   */
  decodeCredentialForDisplay(credential: SDJWTCredential): Record<string, unknown> {
    try {
      // ── Decode selective disclosures ───────────────────────────────────────
      const selectiveFields: Record<string, unknown> = {};

      for (const disclosure of credential.disclosures) {
        try {
          const { field, value } = decodeDisclosure(disclosure);
          selectiveFields[field] = value;
        } catch {
          // Skip malformed disclosures rather than crashing the display
          console.warn('[CryptoService] Could not decode disclosure — skipping:', disclosure);
        }
      }

      // ── Extract always-visible claims from the JWT payload ─────────────────
      // The JWT is three base64url segments separated by dots.
      const jwtSegments = credential.sd_jwt.split('.');
      if (jwtSegments.length < 2) {
        throw new Error('Malformed SD-JWT: fewer than 2 dot-separated segments');
      }

      let jwtPayload: Record<string, unknown>;
      try {
        jwtPayload = JSON.parse(base64urlDecode(jwtSegments[1])) as Record<string, unknown>;
      } catch (err) {
        throw new Error('Failed to decode JWT payload segment');
      }

      // Remove standard JWT claims and the _sd array — display only application claims
      const JWT_STANDARD_CLAIMS = new Set([
        'iss', 'sub', 'iat', 'exp', 'nbf', 'jti', '_sd', '_sd_alg', 'cnf',
      ]);

      const alwaysVisibleFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(jwtPayload)) {
        if (!JWT_STANDARD_CLAIMS.has(key)) {
          alwaysVisibleFields[key] = value;
        }
      }

      // ── Merge: always-visible takes precedence over selective if key clashes ──
      return {
        ...selectiveFields,
        ...alwaysVisibleFields,
      };
    } catch (err) {
      throw new DecodeError(err);
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

let _instance: CryptoService | null = null;

export const cryptoService = {
  getInstance(): CryptoService {
    if (!_instance) {
      _instance = new CryptoService();
    }
    return _instance;
  },
};

export { CryptoService };
export default cryptoService.getInstance();
