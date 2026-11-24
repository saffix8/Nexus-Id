import { createCredential } from "@nexusid/sd-jwt/issuer";
import { buildPredicateClaims } from "@nexusid/sd-jwt/predicates";
import type { SDJWTCredential } from "@nexusid/types";
import type { NadraPersonData } from "./verisys-client";

export class CredentialBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialBuildError";
  }
}

function calculateAge(dateOfBirth: string): number {
  // Accepts: YYYY-MM-DD or DD/MM/YYYY (NADRA may return either)
  let dob: Date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    dob = new Date(dateOfBirth);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth)) {
    const [day, month, year] = dateOfBirth.split("/");
    dob = new Date(`${year}-${month}-${day}`);
  } else {
    throw new CredentialBuildError(
      `Unrecognised date_of_birth format: ${dateOfBirth}`,
    );
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

export async function buildCredential(
  nadraData: NadraPersonData,
  userPublicKey: string,
): Promise<SDJWTCredential> {
  const issuerPrivateKey = process.env.NADRA_ISSUER_PRIVATE_KEY;

  if (!issuerPrivateKey) {
    throw new CredentialBuildError(
      "NADRA_ISSUER_PRIVATE_KEY environment variable is not set",
    );
  }

  const age = calculateAge(nadraData.date_of_birth);

  // FR-007 AC3 / BR-021: the credential carries only catalog predicates,
  // derived here from the NADRA record. Name, CNIC, date of birth, address
  // and the exact age never enter the credential, so they can never be disclosed.
  // NADRA issues a CNIC only to Pakistani citizens, so a verified CNIC record
  // establishes nationality.
  const { claims, metadata } = buildPredicateClaims("nadra.gov.pk", {
    AGE_OVER_18: age >= 18,
    AGE_OVER_21: age >= 21,
    NATIONALITY_PAKISTANI: nadraData.verified === true,
  });

  const credential = await createCredential({
    claims,
    alwaysVisibleClaims: {
      credential_type: "identity",
      issuer_name: "NADRA Pakistan",
    },
    issuerDID: "nadra.gov.pk",
    holderPublicKey: userPublicKey,
    issuerPrivateKey,
    keyId: "nadra-key-v1",
    expiresInDays: 365,
  });

  credential.metadata = metadata;

  return credential;
}
