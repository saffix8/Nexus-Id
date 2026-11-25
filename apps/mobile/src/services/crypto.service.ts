/**
 * apps/mobile/src/services/crypto.service.ts
 *
 * Mobile cryptography layer — bridges the on-device SD-JWT holder
 * (src/crypto/holder.ts) with the Android Keystore. All signing is delegated
 * to KeystoreService so the private key never leaves secure hardware
 * (CON-008, CON-009, BR-017).
 *
 * The holder is a Hermes-safe mirror of packages/sd-jwt/src/holder.ts
 * (pure-JS SHA-256). Its output is cross-checked against the backend verifier
 * by scripts/check-mobile-holder.mts.
 */

import type { Proof, SDJWTCredential } from '@nexusid/types';
import { KeystoreService } from './keystore.service';
import {
  DisclosureNotFoundError,
  decodeDisclosure,
  generateProof,
} from '../crypto/holder';

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
    super(`This credential cannot confirm: ${missingFields.join(', ')}`);
    this.name = 'DisclosureSelectionError';
  }
}

export class SigningError extends CryptoServiceError {
  constructor(cause?: unknown) {
    super(
      cause instanceof Error && cause.message
        ? cause.message
        : 'Signing with the device key failed or was cancelled.',
      cause,
    );
    this.name = 'SigningError';
  }
}

export class DecodeError extends CryptoServiceError {
  constructor(cause?: unknown) {
    super('Failed to decode credential disclosures for display', cause);
    this.name = 'DecodeError';
  }
}

// ─── CryptoService ───────────────────────────────────────────────────────────

class CryptoService {
  private readonly keystoreService: KeystoreService;

  constructor() {
    this.keystoreService = KeystoreService.getInstance();
  }

  // ── 0. signQrChallenge (SRS API-025, ALG-007) ──────────────────────────────

  /**
   * Signs a scanned pairing QR challenge with the hardware-backed device key
   * (biometric prompt), proving to the backend that this registered device
   * redeemed it. The signed string must match qrChallengeSigningInput in
   * services/backend/src/services/qr-challenge.service.ts.
   *
   * @returns Base64 RSA-SHA256 signature.
   */
  async signQrChallenge(
    userId: string,
    challengeId: string,
    code: string,
  ): Promise<string> {
    try {
      return await this.keystoreService.signData(
        userId,
        `nexusid-qr:PAIRING:${challengeId}:${code}`,
        'Pair this browser',
      );
    } catch (err) {
      throw new SigningError(err);
    }
  }

  // ── 1. generateProofForVerification (ALG-001) ──────────────────────────────

  /**
   * Builds the selective-disclosure presentation (only the requested
   * predicate disclosures) and the kb+jwt bound to the verifier and nonce,
   * signed by the Keystore key. The biometric prompt shown while signing is
   * the in-app authentication for the approval (FR-015 → FR-021).
   */
  async generateProofForVerification(params: {
    credential: SDJWTCredential;
    requestedFields: string[];
    verifierId: string;
    nonce: string;
    userId: string;
    promptMessage?: string;
  }): Promise<Proof> {
    const {
      credential,
      requestedFields,
      verifierId,
      nonce,
      userId,
      promptMessage,
    } = params;
    try {
      return await generateProof({
        credential,
        requestedFields,
        verifierId,
        nonce,
        sign: async input => {
          try {
            return await this.keystoreService.signData(
              userId,
              input,
              promptMessage,
            );
          } catch (err) {
            throw new SigningError(err);
          }
        },
      });
    } catch (err) {
      if (err instanceof DisclosureNotFoundError)
        throw new DisclosureSelectionError([err.field]);
      throw err;
    }
  }

  // ── 2. decodeCredentialForDisplay ──────────────────────────────────────────

  /**
   * Decodes the selectively-disclosable claims into a { field: value } map.
   * On-device only — never sent anywhere (BR-011).
   */
  decodeCredentialForDisplay(
    credential: SDJWTCredential,
  ): Record<string, unknown> {
    try {
      const out: Record<string, unknown> = {};
      for (const d of credential.disclosures) {
        const { field, value } = decodeDisclosure(d);
        out[field] = value;
      }
      return out;
    } catch (err) {
      throw new DecodeError(err);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: CryptoService | null = null;

export const cryptoService = {
  getInstance(): CryptoService {
    if (!_instance) _instance = new CryptoService();
    return _instance;
  },
};

export { CryptoService };
export default cryptoService.getInstance();
