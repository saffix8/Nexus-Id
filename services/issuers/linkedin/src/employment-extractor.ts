import type { SDJWTCredential } from "@nexusid/types";
import { createCredential } from "@nexusid/sd-jwt/issuer";
import { buildPredicateClaims } from "@nexusid/sd-jwt/predicates";
import { readFileSync } from "fs";
import { join } from "path";
import type { LinkedInProfile, LinkedInPosition } from "./oauth-client.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Total years of professional experience across all positions.
 * Uses the current year as the end for roles that are still active.
 */
export function calculateTotalExperience(
  positions: LinkedInPosition[],
): number {
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
export function getCurrentPosition(
  positions: LinkedInPosition[],
): LinkedInPosition | null {
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
  const keyPath =
    process.env.LINKEDIN_ISSUER_PRIVATE_KEY_PATH ??
    join(process.cwd(), ".keys", ".issuer-private-key.pem");

  try {
    return readFileSync(keyPath, "utf-8");
  } catch {
    const envKey = process.env.LINKEDIN_ISSUER_PRIVATE_KEY;
    if (!envKey) {
      throw new EmploymentExtractorError(
        "KEY_NOT_FOUND",
        "LinkedIn issuer private key not found. Set LINKEDIN_ISSUER_PRIVATE_KEY or LINKEDIN_ISSUER_PRIVATE_KEY_PATH.",
      );
    }
    return envKey.replace(/\\n/g, "\n");
  }
}

export async function buildCredential(
  profile: LinkedInProfile,
  positions: LinkedInPosition[],
  userPublicKey: string,
): Promise<SDJWTCredential> {
  // FR-007 AC3 / BR-021: only the catalog predicate. Profile ID, name,
  // email, employer and title never enter the credential.
  const currentPosition = getCurrentPosition(positions);
  const { claims, metadata } = buildPredicateClaims("linkedin.com", {
    EMPLOYMENT_ACTIVE: currentPosition?.is_current === true,
  });

  const issuerPrivateKey = loadIssuerPrivateKey();

  const credential = await createCredential({
    claims,
    alwaysVisibleClaims: {
      credential_type: "employment",
      issuer_name: "LinkedIn",
    },
    issuerDID: "linkedin.com",
    holderPublicKey: userPublicKey,
    issuerPrivateKey,
    keyId: "linkedin-issuer-key-v1",
    expiresInDays: 90, // LinkedIn data changes frequently; shorter TTL
  });

  return { ...credential, metadata };
}

// ── Typed Error ───────────────────────────────────────────────────────────────

export class EmploymentExtractorError extends Error {
  constructor(
    public readonly code: "KEY_NOT_FOUND" | "CREDENTIAL_BUILD_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "EmploymentExtractorError";
  }
}
