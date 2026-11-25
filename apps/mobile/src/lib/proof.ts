// SCR-008 → SCR-009 orchestration of ALG-001. The cryptography lives in
// src/crypto/holder.ts + crypto.service.ts (Keystore signing).
//
// Approve (ConsentSheet) runs check + generate: the Keystore signing prompt is
// the in-app authentication for the approval (FR-015 → FR-021), so the user
// sees one fingerprint prompt. The ProofStepper then shows those steps and sends.
import type { Proof, SDJWTCredential } from '@nexusid/types';
import { apiService, type PendingRequestDTO } from '../services/api.service';
import { timing } from '../styles/tokens';

export type ProofStep = 'check' | 'generate' | 'send';
export const PROOF_STEPS: ProofStep[] = ['check', 'generate', 'send'];

export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Runs `fn` but keeps the step on screen for at least 400 ms (DESIGN §5.3). */
export async function minDuration<T>(fn: () => Promise<T>): Promise<T> {
  const [value] = await Promise.all([fn(), wait(timing.stepMinMs)]);
  return value;
}

export class ProofStepError extends Error {
  constructor(public step: ProofStep, message: string, public cancelled = false) {
    super(message);
  }
}

/** Step 1 — the credential can still answer this request. */
export function checkRequest(request: PendingRequestDTO, credential: SDJWTCredential, revoked: ReadonlySet<string>): void {
  if (Date.parse(request.expiresAt) <= Date.now()) throw new ProofStepError('check', 'This request expired before the proof was sent.');
  if (revoked.has(credential.id)) throw new ProofStepError('check', 'This credential was revoked by its issuer.');
  if (Date.parse(credential.expires_at) <= Date.now()) throw new ProofStepError('check', 'This credential has expired. Renew it with the issuer.');
}

/** Step 2 — selective disclosure + KB-JWT signed by the Keystore key (biometric prompt). */
export async function buildProof(request: PendingRequestDTO, credential: SDJWTCredential, userId: string): Promise<Proof> {
  const { default: cryptoService, SigningError } = await import('../services/crypto.service');
  try {
    return await cryptoService.generateProofForVerification({
      credential,
      requestedFields: request.requestedFields,
      verifierId: request.verifierId,
      nonce: request.nonce,
      userId,
      promptMessage: `Approve request from ${request.verifierName}`,
    });
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Could not generate the proof on this device.';
    const cancelled = err instanceof SigningError && /cancel/i.test(message);
    throw new ProofStepError('generate', cancelled ? 'Approval cancelled.' : message, cancelled);
  }
}

/** Step 3 — API-035; the backend runs ALG-002. */
export async function sendProof(request: PendingRequestDTO, proof: Proof): Promise<void> {
  try {
    await apiService.submitProof(request.requestId, proof);
  } catch (err) {
    throw new ProofStepError('send', err instanceof Error && err.message ? err.message : 'NexusID did not accept the proof.');
  }
}
