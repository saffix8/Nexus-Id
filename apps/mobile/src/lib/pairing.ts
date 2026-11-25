// Parses a NexusID QR: the extension's pairing code (FR-003) or the web portal's
// sign-in code (FR-036, SCR-013).
export type QrPurpose = 'PAIRING' | 'SIGN_IN';

export interface PairingPayload {
  challengeId: string;
  code: string;
  purpose: QrPurpose;
}

/**
 * Current form is a web-portal link `<origin>/pair#p=<challengeId>&c=<code>[&t=SIGN_IN]`;
 * the older raw JSON {"v":1,"type":"nexusid-pair","pairingId","code"} is still accepted.
 * Parsed by hand: React Native's URL polyfill lacks full URLSearchParams.
 */
function parsePairingLink(raw: string): PairingPayload | null {
  const hashAt = raw.indexOf('#');
  if (hashAt < 0) return null;
  const path = raw.slice(0, hashAt).replace(/\/+$/, '');
  if (!path.endsWith('/pair')) return null;

  const fields: Record<string, string> = {};
  for (const part of raw.slice(hashAt + 1).split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    try {
      fields[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
    } catch {
      return null;
    }
  }
  const challengeId = fields.p;
  const code = fields.c;
  const purpose: QrPurpose | null =
    fields.t === undefined || fields.t === 'PAIRING'
      ? 'PAIRING'
      : fields.t === 'SIGN_IN'
        ? 'SIGN_IN'
        : null;
  return challengeId && code && purpose ? { challengeId, code, purpose } : null;
}

export function parsePairingPayload(raw: string): PairingPayload | null {
  const text = raw.trim();
  if (!text.startsWith('{')) return parsePairingLink(text);
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    if (v.v !== 1 || v.type !== 'nexusid-pair') return null;
    if (typeof v.pairingId !== 'string' || typeof v.code !== 'string') return null;
    return { challengeId: v.pairingId, code: v.code, purpose: 'PAIRING' };
  } catch {
    return null;
  }
}
