/**
 * apps/mobile/src/services/zkp.service.ts
 *
 * Mobile-side ZKP presentation layer.
 *
 * The heavy proof GENERATION happens on the backend at credential issuance time
 * (services/backend/src/services/zkp.service.ts). The resulting proofs are
 * stored inside the credential's metadata.zkp_age_proofs.
 *
 * This service handles the PRESENTATION side:
 *  - Reading stored proofs from the credential
 *  - Building a ZKP presentation payload (proof + public signals + nonce binding)
 *  - Letting the VerificationApprovalScreen decide whether to use ZKP or SD-JWT
 *    disclosure for age-related fields
 */

import type { SDJWTCredential } from '@nexusid/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: 'groth16';
  curve: 'bn128';
}

export interface StoredAgeProof {
  proof:          Groth16Proof;
  publicSignals:  string[];
  meetsThreshold: boolean;
}

export interface StoredAgeProofs {
  over18:      StoredAgeProof | null;
  over21:      StoredAgeProof | null;
  generatedAt: string;
  currentYear: number;
}

/**
 * A ZKP age presentation — what the mobile app sends to the backend
 * instead of disclosing date_of_birth via SD-JWT when the verifier
 * only needs an age threshold check.
 */
export interface ZKPAgePresentation {
  type:            'zkp_age';
  threshold:       18 | 21;
  proof:           Groth16Proof;
  publicSignals:   string[];
  // nonce from the verification request — proves this presentation is fresh
  // (the verifier checks this to prevent replay attacks)
  nonce:           string;
  // ISO timestamp of when this presentation was assembled
  presentedAt:     string;
  // Year the proof was generated — verifier may reject stale proofs
  proofGeneratedYear: number;
}

export type AgeVerificationStrategy = 'zkp' | 'sd_jwt_disclosure' | 'unavailable';

// ─── ZKP Mobile Service ───────────────────────────────────────────────────────

export class MobileZKPService {

  /**
   * Determines the best strategy for proving an age requirement.
   *
   * Returns 'zkp' when a pre-generated proof is available AND was generated
   * in the current calendar year (proofs older than ~1 year may be stale
   * since current_year is baked into the circuit).
   *
   * Returns 'sd_jwt_disclosure' as a fallback — the age field is selectively
   * disclosed instead (reveals the exact age but no ZKP required).
   *
   * Returns 'unavailable' if neither strategy can satisfy the request.
   */
  determineAgeStrategy(
    credential: SDJWTCredential,
    requestedField: 'age_over_18' | 'age_over_21' | 'age'
  ): AgeVerificationStrategy {
    const proofs = this.extractStoredProofs(credential);

    // If the verifier asked for age_over_18 or age_over_21, try ZKP first
    if (requestedField === 'age_over_18' || requestedField === 'age_over_21') {
      const threshold: 18 | 21 = requestedField === 'age_over_18' ? 18 : 21;
      const stored = threshold === 18 ? proofs?.over18 : proofs?.over21;

      if (stored && this.isProofFresh(proofs!)) {
        return 'zkp';
      }
    }

    // Fall back to SD-JWT selective disclosure
    const disclosableFields = credential.metadata?.selectively_disclosable_fields ?? [];
    const alwaysVisibleFields = credential.metadata?.always_visible_fields ?? [];

    if (
      disclosableFields.includes(requestedField) ||
      alwaysVisibleFields.includes(requestedField)
    ) {
      return 'sd_jwt_disclosure';
    }

    return 'unavailable';
  }

  /**
   * Builds a ZKP age presentation ready to submit to the backend.
   *
   * Call this when determineAgeStrategy returns 'zkp'.
   */
  buildZKPPresentation(
    credential: SDJWTCredential,
    threshold:  18 | 21,
    nonce:      string
  ): ZKPAgePresentation {
    const proofs = this.extractStoredProofs(credential);
    if (!proofs) {
      throw new MobileZKPError(
        'No ZK age proofs found in credential metadata',
        'NO_PROOF_STORED'
      );
    }

    const stored = threshold === 18 ? proofs.over18 : proofs.over21;
    if (!stored) {
      throw new MobileZKPError(
        `No stored ZK proof for threshold ${threshold}`,
        'NO_PROOF_STORED'
      );
    }

    if (!this.isProofFresh(proofs)) {
      throw new MobileZKPError(
        `ZK proof is stale (generated in ${proofs.currentYear}, ` +
        `current year is ${new Date().getFullYear()}). ` +
        `Re-issue the credential to get fresh proofs.`,
        'PROOF_STALE'
      );
    }

    if (!stored.meetsThreshold) {
      throw new MobileZKPError(
        `User does not meet age threshold ${threshold}`,
        'THRESHOLD_NOT_MET'
      );
    }

    return {
      type:               'zkp_age',
      threshold,
      proof:              stored.proof,
      publicSignals:      stored.publicSignals,
      nonce,
      presentedAt:        new Date().toISOString(),
      proofGeneratedYear: proofs.currentYear,
    };
  }

  /**
   * Returns a human-readable summary of available ZKP proofs for display
   * in the VerificationApprovalScreen UI.
   *
   * e.g. "Age ≥ 18 ✓  (ZK proof — date of birth stays hidden)"
   */
  getProofSummary(credential: SDJWTCredential): {
    over18Available: boolean;
    over21Available: boolean;
    isFresh:         boolean;
    generatedAt:     string | null;
  } {
    const proofs = this.extractStoredProofs(credential);
    if (!proofs) {
      return { over18Available: false, over21Available: false, isFresh: false, generatedAt: null };
    }

    const fresh = this.isProofFresh(proofs);
    return {
      over18Available: proofs.over18 !== null && proofs.over18.meetsThreshold && fresh,
      over21Available: proofs.over21 !== null && proofs.over21.meetsThreshold && fresh,
      isFresh:         fresh,
      generatedAt:     proofs.generatedAt,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private extractStoredProofs(credential: SDJWTCredential): StoredAgeProofs | null {
    const raw = (credential.metadata as unknown as Record<string, unknown>)?.zkp_age_proofs;
    if (!raw || typeof raw !== 'object') return null;
    return raw as StoredAgeProofs;
  }

  /**
   * A proof is fresh if it was generated in the current calendar year.
   * The Circom circuit bakes current_year into publicSignals, so a proof from
   * a prior year would fail verification once the year rolls over.
   */
  private isProofFresh(proofs: StoredAgeProofs): boolean {
    return proofs.currentYear === new Date().getFullYear();
  }
}

// ─── Typed error ──────────────────────────────────────────────────────────────

export type MobileZKPErrorCode =
  | 'NO_PROOF_STORED'
  | 'PROOF_STALE'
  | 'THRESHOLD_NOT_MET';

export class MobileZKPError extends Error {
  constructor(
    message: string,
    public readonly code: MobileZKPErrorCode
  ) {
    super(message);
    this.name = 'MobileZKPError';
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const mobileZKPService = new MobileZKPService();
