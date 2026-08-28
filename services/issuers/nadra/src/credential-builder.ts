import { createCredential } from '@nexusid/sd-jwt/src/issuer';
import type { SDJWTCredential, RawClaim } from '@nexusid/types';
import type { NadraPersonData } from './verisys-client';

export class CredentialBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialBuildError';
  }
}

function calculateAge(dateOfBirth: string): number {
  // Accepts: YYYY-MM-DD or DD/MM/YYYY (NADRA may return either)
  let dob: Date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    dob = new Date(dateOfBirth);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth)) {
    const [day, month, year] = dateOfBirth.split('/');
    dob = new Date(`${year}-${month}-${day}`);
  } else {
    throw new CredentialBuildError(`Unrecognised date_of_birth format: ${dateOfBirth}`);
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
  userPublicKey: string
): Promise<SDJWTCredential> {
  const issuerPrivateKey = process.env.NADRA_ISSUER_PRIVATE_KEY;

  if (!issuerPrivateKey) {
    throw new CredentialBuildError(
      'NADRA_ISSUER_PRIVATE_KEY environment variable is not set'
    );
  }

  const age = calculateAge(nadraData.date_of_birth);

  const selectiveClaims: RawClaim[] = [
    { field: 'full_name',     value: nadraData.full_name },
    { field: 'father_name',   value: nadraData.father_name },
    { field: 'date_of_birth', value: nadraData.date_of_birth },
    { field: 'cnic',          value: nadraData.cnic },
    { field: 'gender',        value: nadraData.gender },
    { field: 'address',       value: nadraData.address },
    { field: 'age',           value: age },
    { field: 'age_over_18',   value: age >= 18 },
    { field: 'age_over_21',   value: age >= 21 },
  ];

  const alwaysVisibleClaims: Record<string, unknown> = {
    credential_type: 'identity',
    issuer_name:     'NADRA Pakistan',
    verified:        true,
    issue_date:      nadraData.issue_date,
    expiry_date:     nadraData.expiry_date,
  };

  const credential = await createCredential({
    claims: selectiveClaims,
    alwaysVisibleClaims,
    issuerDID:        'nadra.gov.pk',
    subject:          nadraData.cnic,
    issuerPrivateKey,
    keyId:            'nadra-key-v1',
    expiresInDays:    365,
  });

  // Attach field labels for UI display
  credential.metadata = {
    always_visible_fields: ['credential_type', 'issuer_name', 'verified', 'issue_date', 'expiry_date'],
    selectively_disclosable_fields: [
      'full_name', 'father_name', 'date_of_birth', 'cnic',
      'gender', 'address', 'age', 'age_over_18', 'age_over_21',
    ],
    field_labels: {
      full_name:     'Full Name',
      father_name:   "Father's Name",
      date_of_birth: 'Date of Birth',
      cnic:          'CNIC Number',
      gender:        'Gender',
      address:       'Address',
      age:           'Age',
      age_over_18:   'Age Over 18',
      age_over_21:   'Age Over 21',
      credential_type: 'Credential Type',
      issuer_name:   'Issuer',
      verified:      'Verified',
      issue_date:    'CNIC Issue Date',
      expiry_date:   'CNIC Expiry Date',
    },
  };

  return credential;
}
