/**
 * Predicate claim catalog (SRS FR-005, BR-021).
 *
 * The single list of conditions that may be issued, configured by a Service
 * Provider, requested in a session, or disclosed in a proof. Issuers sign each
 * predicate as a selectively disclosable boolean claim named by its code
 * (e.g. `AGE_OVER_18: true`); a proof discloses exactly one of them.
 *
 * CGPA predicates are issued by Air University: FR-005 AC1 lists them under
 * enrollment, and the AU record is the only source that carries a CGPA.
 */

export type PredicateCategory =
  "NATIONAL_IDENTITY" | "EDUCATION" | "ENROLLMENT" | "EMPLOYMENT";

export interface PredicateDefinition {
  code: string;
  category: PredicateCategory;
  /** Plain-language label shown to End Users and Service Providers (NFR-005). */
  label: string;
  /** Issuer ID (issuer registry `issuer_id`) that signs this predicate. */
  issuer: string;
}

export const PREDICATE_CATALOG = {
  AGE_OVER_18: {
    code: "AGE_OVER_18",
    category: "NATIONAL_IDENTITY",
    label: "Age over 18",
    issuer: "nadra.gov.pk",
  },
  AGE_OVER_21: {
    code: "AGE_OVER_21",
    category: "NATIONAL_IDENTITY",
    label: "Age over 21",
    issuer: "nadra.gov.pk",
  },
  NATIONALITY_PAKISTANI: {
    code: "NATIONALITY_PAKISTANI",
    category: "NATIONAL_IDENTITY",
    label: "Pakistani national",
    issuer: "nadra.gov.pk",
  },
  DEGREE_BACHELOR_OR_HIGHER: {
    code: "DEGREE_BACHELOR_OR_HIGHER",
    category: "EDUCATION",
    label: "Bachelor's degree or higher",
    issuer: "hec.gov.pk",
  },
  CGPA_AT_LEAST_2_0: {
    code: "CGPA_AT_LEAST_2_0",
    category: "ENROLLMENT",
    label: "CGPA at least 2.0",
    issuer: "au.edu.pk",
  },
  CGPA_AT_LEAST_3_0: {
    code: "CGPA_AT_LEAST_3_0",
    category: "ENROLLMENT",
    label: "CGPA at least 3.0",
    issuer: "au.edu.pk",
  },
  CGPA_AT_LEAST_3_5: {
    code: "CGPA_AT_LEAST_3_5",
    category: "ENROLLMENT",
    label: "CGPA at least 3.5",
    issuer: "au.edu.pk",
  },
  ENROLLED_CURRENT: {
    code: "ENROLLED_CURRENT",
    category: "ENROLLMENT",
    label: "Currently enrolled at Air University",
    issuer: "au.edu.pk",
  },
  EMPLOYMENT_ACTIVE: {
    code: "EMPLOYMENT_ACTIVE",
    category: "EMPLOYMENT",
    label: "Currently employed",
    issuer: "linkedin.com",
  },
} as const satisfies Record<string, PredicateDefinition>;

export type PredicateCode = keyof typeof PREDICATE_CATALOG;

export const PREDICATE_CODES = Object.keys(
  PREDICATE_CATALOG,
) as PredicateCode[];

export function isPredicateCode(value: unknown): value is PredicateCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PREDICATE_CATALOG, value)
  );
}

export function predicateLabel(code: string): string {
  return isPredicateCode(code) ? PREDICATE_CATALOG[code].label : code;
}

/**
 * Issuance helper (FR-007 AC3, BR-021): turns an issuer's derived booleans
 * into selectively disclosable predicate claims plus display metadata.
 * Refuses codes outside the catalog and codes another issuer is responsible for.
 */
export function buildPredicateClaims(
  issuerId: string,
  values: Partial<Record<PredicateCode, boolean>>,
): {
  claims: { field: PredicateCode; value: boolean }[];
  metadata: {
    always_visible_fields: string[];
    selectively_disclosable_fields: string[];
    field_labels: Record<string, string>;
  };
} {
  const claims: { field: PredicateCode; value: boolean }[] = [];
  for (const [code, value] of Object.entries(values)) {
    if (!isPredicateCode(code)) {
      throw new Error(`'${code}' is not in the predicate catalog`);
    }
    if (PREDICATE_CATALOG[code].issuer !== issuerId) {
      throw new Error(`'${code}' is issued by ${PREDICATE_CATALOG[code].issuer}, not ${issuerId}`);
    }
    if (typeof value !== "boolean") {
      throw new Error(`Predicate '${code}' must be a boolean`);
    }
    claims.push({ field: code, value });
  }
  if (claims.length === 0) {
    throw new Error("A credential must carry at least one predicate claim");
  }

  const field_labels: Record<string, string> = {
    credential_type: "Credential Type",
    issuer_name: "Issuer",
  };
  for (const c of claims) field_labels[c.field] = PREDICATE_CATALOG[c.field].label;

  return {
    claims,
    metadata: {
      always_visible_fields: ["credential_type", "issuer_name"],
      selectively_disclosable_fields: claims.map((c) => c.field),
      field_labels,
    },
  };
}
