// FR-002 device key, via keystore.service.ts as documented there:
// the PEM is only returned by generateKeyPair(), so it is cached in the auth
// store; without a cached PEM the pair is re-created (deleteKeyPair → generateKeyPair).
import { keystoreService } from '../services/keystore.service';
import { apiService } from '../services/api.service';
import { base64urlDecodeBytes, utf8Decode } from '../crypto/holder';

export async function ensureDeviceKey(userId: string, cachedPem: string | null): Promise<string> {
  const exists = await keystoreService.isKeyAvailable(userId);
  let pem = exists ? cachedPem : null;
  if (!pem) {
    if (exists) await keystoreService.deleteKeyPair(userId);
    pem = (await keystoreService.generateKeyPair(userId)).publicKeyPEM;
  }
  await apiService.updateMyPublicKey(pem);
  return pem;
}

/** `sub` claim of a JWT (user id). Payload only — the token is verified by the backend. */
export function jwtSubject(token: string): string | null {
  try {
    const payload = JSON.parse(utf8Decode(base64urlDecodeBytes(token.split('.')[1]))) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
