import type { SDJWTCredential, RawClaim } from '@nexusid/types';
import { createCredential } from '@nexusid/sd-jwt/issuer';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { LinkedInProfile, LinkedInPosition } from './oauth-client.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Total years of professional experience across all positions.
 * Uses the current year as the end for roles that are still active.
 */
export function calculateTotalExperience(positions: LinkedInPosition[]): number {
  if (positions.length === 0) return 0;

  const currentYear = new Date().getFullYear();
  let totalMonths = 0;

  for (const pos of positions) {
    const endYear = pos.end_year ?? currentYear;
    totalMonths += Math.max(0, endYear - pos.start_year) * 12;
  }

  return Math.round((totalMonths / 12) * 10) / 10; // 1 decimal place
}

/**
 * Returns the most recent current position, or the most recent past
 * position if none are marked current.
 */
export function getCurrentPosition(positions: LinkedInPosition[]): LinkedInPosition | null {
  if (positions.length === 0) return null;

  const current = positions.find((p) => p.is_current);
  if (current) return current;

  // Fall back to the most recently ended position
  return positions.reduce<LinkedInPosition | null>((latest, pos) => {
    if (!latest) return pos;
    const latestEnd = latest.end_year ?? 0;
    const posEnd = pos.end_year ?? 0;
    return posEnd > latestEnd ? pos : latest;
  }, null);
}

// ── Credential Builder ────────────────────────────────────────────────────────

function loadIssuerPrivateKey(): string {
  const keyPath = process.env.LINKEDIN_ISSUER_PRIVATE_KEY_PATH
    ?? join(process.cwd(), '.keys', 'issuer-private-key.pem');

  try {
    return readFileSync(keyPath, 'utf-8');
  } catch {
    const envKey = process.env.LINKEDIN_ISSUER_PRIVATE_KEY;
    if (!envKey) {
      throw new EmploymentExtractorError(
        'KEY_NOT_FOUND',
        'LinkedIn issuer private key not found. Set LINKEDIN_ISSUER_PRIVATE_KEY or LINKEDIN_ISSUER_PRIVATE_KEY_PATH.'
      );
    }
    return envKey.replace(/\\n/g, '\n');
  }
}

export async function buildCredential(
  profile: LinkedInProfile,
  positions: LinkedInPosition[],
  userPublicKey: string
): Promise<SDJWTCredential> {
  const currentPosition = getCurrentPosition(positions);
  const totalExperienceYears = calculateTotalExperience(positions);
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  const employmentStatus: string =
    currentPosition?.is_current ? 'Employed' : positions.length > 0 ? 'Previously Employed' : 'Not Employed';

  const alwaysVisibleClaims: Record<string, unknown> = {
    credential_type: 'employment',
    issuer_name: 'LinkedIn',
    verified: true,
    profile_id: profile.id,
  };

  const selectiveFields: RawClaim[] = [
    { field: 'name',                  value: fullName },
    { field: 'email',                 value: profile.email },
    { field: 'current_company',       value: currentPosition?.company ?? '' },
    { field: 'current_title',         value: currentPosition?.title ?? '' },
    { field: 'employment_status',     value: employmentStatus },
    { field: 'total_experience_years',value: totalExperienceYears },
    { field: 'position_count',        value: positions.length },
  ];

  const issuerPrivateKey = loadIssuerPrivateKey();

  return createCredential({
    claims: selectiveFields,
    alwaysVisibleClaims,
    issuerDID: 'linkedin.com',
    subject: profile.id,
    issuerPrivateKey,
    keyId: 'linkedin-issuer-key-v1',
    expiresInDays: 90, // LinkedIn data changes frequently; shorter TTL
  });
}

// ── Typed Error ───────────────────────────────────────────────────────────────

export class EmploymentExtractorError extends Error {
  constructor(
    public readonly code: 'KEY_NOT_FOUND' | 'CREDENTIAL_BUILD_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'EmploymentExtractorError';
  }
}
