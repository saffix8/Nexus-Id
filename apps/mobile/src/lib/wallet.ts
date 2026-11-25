// Wallet display rules shared by the screens.
import type { SDJWTCredential } from '@nexusid/types';
import { disclosableFields } from '../crypto/holder';

export type CredentialUiStatus = 'valid' | 'expired' | 'revoked';

export function credentialStatus(cred: SDJWTCredential, revoked: ReadonlySet<string>, now = Date.now()): CredentialUiStatus {
  if (revoked.has(cred.id)) return 'revoked';
  const exp = Date.parse(cred.expires_at);
  if (!Number.isNaN(exp) && exp <= now) return 'expired';
  return 'valid';
}

/** First valid credential that carries the requested predicate as a disclosure (same rule as the web holder). */
export function pickCredentialFor(
  predicate: string,
  creds: SDJWTCredential[],
  revoked: ReadonlySet<string>,
): SDJWTCredential | null {
  const valid = creds.filter(c => credentialStatus(c, revoked) === 'valid');
  return valid.find(c => disclosableFields(c).includes(predicate)) ?? null;
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
