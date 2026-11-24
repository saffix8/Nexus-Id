/**
 * NexusID — Shared TypeScript Types
 * Single source of truth for all types shared across:
 *   - apps/mobile
 *   - apps/web
 *   - services/backend
 *   - packages/sd-jwt
 */

// ── CREDENTIAL TYPES ─────────────────────────────────────────

export type CredentialType = 'identity' | 'education' | 'employment' | 'enrollment';

export type CredentialStatus = 'active' | 'expired' | 'revoked';

export interface RawClaim {
  field: string;
  value: string | number | boolean;
}

/** A base64url-encoded disclosure string: base64url([salt, field, value]) */
export type Disclosure = string;

export interface CredentialMetadata {
  /** Fields always visible to verifiers — not selectively disclosable */
  always_visible_fields: string[];
  /** Fields the holder can choose to reveal or hide */
  selectively_disclosable_fields: string[];
  /** Human-readable labels for display in the UI */
  field_labels: Record<string, string>;
}

export interface SDJWTCredential {
  id: string;
  type: CredentialType;
  issuer: string;          // IssuerID — e.g. "nadra.gov.pk"
  subject: string;         // opaque credential ID (= JWT jti); never a real identifier
  sd_jwt: string;          // The compact JWT string (header.payload.signature)
  disclosures: Disclosure[]; // All disclosure strings for this credential
  issued_at: string;       // ISO timestamp
  expires_at: string;      // ISO timestamp
  display_name?: string;   // e.g. "NADRA Identity" — for UI display
  display_icon?: string;   // emoji or icon identifier
  metadata: CredentialMetadata;
}

// ── PROOF TYPES ───────────────────────────────────────────────

export interface Presentation {
  sd_jwt: string;
  disclosures: Disclosure[]; // Only the ones the holder chose to disclose
}

export interface KeyBindingPayload {
  iat: number;
  aud: string;   // verifier_id
  nonce: string; // from the verification request
  sd_hash: string; // SHA-256 of (sd_jwt + "~" + disclosures.join("~"))
}

export interface Proof {
  presentation: Presentation;
  key_binding: string;  // Compact kb+jwt string
  timestamp: string;    // ISO timestamp of when proof was generated
  verifier_id: string;  // Who this proof is intended for
}

// ── VERIFICATION TYPES ───────────────────────────────────────

export type VerificationStatus = 'pending' | 'completed' | 'failed' | 'rejected' | 'expired';

/** SRS outcome names (FR-045): completed → VERIFIED, failed → FAILED, rejected → DECLINED, expired → EXPIRED. */
export type VerificationOutcome = 'PENDING' | 'VERIFIED' | 'FAILED' | 'DECLINED' | 'EXPIRED';

export interface VerificationRequest {
  id: string;
  verifier_id: string;
  verifier_name: string;
  requested_fields: string[];
  nonce: string;
  callback_url?: string;
  page_url: string;
  status: VerificationStatus;
  expires_at: string;
  created_at: string;
  trusted?: boolean;     // Whether verifier is in the trusted registry
}

export interface VerificationResult {
  request_id: string;
  verified_fields: Record<string, unknown>;
  issuer: string;
  proof_hash: string;
  verified_at: string;
}

export interface VerificationHistoryRecord {
  id: string;
  request_id: string;
  credential_id: string;
  verifier_id: string;
  verifier_name: string;
  disclosed_fields: string[];
  disclosed_values?: Record<string, unknown>;
  timestamp: string;
  status: 'approved' | 'rejected';
  credential_type?: CredentialType;
}

// ── ISSUER TYPES ─────────────────────────────────────────────

export type IssuerID =
  | 'nadra.gov.pk'
  | 'hec.gov.pk'
  | 'au.edu.pk'
  | 'linkedin.com';

export interface IssuerPublicKey {
  issuer_id: IssuerID;
  kid: string;         // Key ID
  public_key: string;  // RSA public key PEM
  algorithm: 'RS256';
}

export interface IssuerRegistryEntry {
  id: string;
  issuer_id: string;
  name: string;
  jwks_url: string;
  public_key: string;
  active: boolean;
  added_at: string;
}

// ── API RESPONSE TYPES ───────────────────────────────────────

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}

// ── NOTIFICATION TYPES ───────────────────────────────────────

export interface PushNotificationPayload {
  type: 'VERIFICATION_REQUEST';
  verification_request_id: string;
  verifier_id: string;
  verifier_name: string;
  requested_fields: string;   // JSON-stringified string[] (FCM data values must be strings)
  nonce: string;
  expires_at: string;
}

// ── PENDING VERIFICATION (mobile-local) ─────────────────────

export interface PendingVerification {
  id: string;                  // verification_request_id
  verifier_id: string;
  verifier_name: string;
  requested_fields: string[];
  nonce: string;
  expires_at: string;
  received_at: string;
  status: 'pending' | 'approved' | 'rejected';
  trusted?: boolean;
}

// ── ANALYTICS TYPES ─────────────────────────────────────────

export interface VerificationAnalytics {
  total_verifications: number;
  verifications_this_month: number;
  success_rate: number;           // 0–100
  avg_response_time_seconds: number;
  daily_counts: Array<{
    date: string;
    count: number;
  }>;
  field_frequency: Array<{
    field: string;
    count: number;
  }>;
  status_breakdown: {
    completed: number;
    rejected: number;
    expired: number;
  };
}

// ── FRAUD DETECTION ──────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FraudRiskResult {
  risk_score: number;    // 0–100
  risk_level: RiskLevel;
  is_anomaly: boolean;
  features: Record<string, number>;
}

// ── USER TYPES ───────────────────────────────────────────────

export interface UserProfile {
  id: string;
  public_key: string;
  created_at: string;
  updated_at: string;
}

export interface AuthTokenResponse {
  token: string;
  expires_at: string;
}

// ── PREDICATE + CATEGORY DISPLAY (DESIGN.md §3.1, §3.6, §5.6) ─
// Shared by web, mobile and extension so every surface shows the same label,
// colour and icon for a predicate. Codes and categories match the catalog in
// packages/sd-jwt/src/predicates.ts (FR-005, BR-021) — CGPA is issued by Air
// University, so it sits under enrollment.

export type PredicateCode =
  | 'AGE_OVER_18'
  | 'AGE_OVER_21'
  | 'NATIONALITY_PAKISTANI'
  | 'DEGREE_BACHELOR_OR_HIGHER'
  | 'CGPA_AT_LEAST_2_0'
  | 'CGPA_AT_LEAST_3_0'
  | 'CGPA_AT_LEAST_3_5'
  | 'ENROLLED_CURRENT'
  | 'EMPLOYMENT_ACTIVE';

export interface PredicateDisplay {
  code: PredicateCode;
  /** Human label (Inter). The code is shown underneath in mono. */
  label: string;
  category: CredentialType;
}

export const PREDICATE_DISPLAY: Readonly<Record<PredicateCode, PredicateDisplay>> = {
  AGE_OVER_18: { code: 'AGE_OVER_18', label: 'Age over 18', category: 'identity' },
  AGE_OVER_21: { code: 'AGE_OVER_21', label: 'Age over 21', category: 'identity' },
  NATIONALITY_PAKISTANI: { code: 'NATIONALITY_PAKISTANI', label: 'Pakistani national', category: 'identity' },
  DEGREE_BACHELOR_OR_HIGHER: { code: 'DEGREE_BACHELOR_OR_HIGHER', label: "Bachelor's degree or higher", category: 'education' },
  CGPA_AT_LEAST_2_0: { code: 'CGPA_AT_LEAST_2_0', label: 'CGPA ≥ 2.0', category: 'enrollment' },
  CGPA_AT_LEAST_3_0: { code: 'CGPA_AT_LEAST_3_0', label: 'CGPA ≥ 3.0', category: 'enrollment' },
  CGPA_AT_LEAST_3_5: { code: 'CGPA_AT_LEAST_3_5', label: 'CGPA ≥ 3.5', category: 'enrollment' },
  ENROLLED_CURRENT: { code: 'ENROLLED_CURRENT', label: 'Currently enrolled', category: 'enrollment' },
  EMPLOYMENT_ACTIVE: { code: 'EMPLOYMENT_ACTIVE', label: 'Currently employed', category: 'employment' },
};

export const PREDICATE_CODES = Object.keys(PREDICATE_DISPLAY) as PredicateCode[];

export function isPredicateCode(value: string): value is PredicateCode {
  return Object.prototype.hasOwnProperty.call(PREDICATE_DISPLAY, value);
}

/** Label for a code; unknown codes fall back to the raw code. */
export function predicateLabel(code: string): string {
  return isPredicateCode(code) ? PREDICATE_DISPLAY[code].label : code;
}

export interface CategoryDisplay {
  label: string;
  issuerName: string;
  /** Hex colour token `cat-*` (DESIGN.md §3.1). */
  color: string;
  /** lucide icon name — resolve with lucide-react / lucide-react-native. */
  icon: 'IdCard' | 'GraduationCap' | 'BriefcaseBusiness' | 'School';
}

export const CATEGORY_DISPLAY: Readonly<Record<CredentialType, CategoryDisplay>> = {
  identity: { label: 'National Identity', issuerName: 'NADRA Pakistan', color: '#3B82F6', icon: 'IdCard' },
  education: { label: 'Education', issuerName: 'Higher Education Commission', color: '#8B5CF6', icon: 'GraduationCap' },
  employment: { label: 'Employment', issuerName: 'LinkedIn', color: '#0EA5E9', icon: 'BriefcaseBusiness' },
  enrollment: { label: 'Enrollment', issuerName: 'Air University', color: '#10B981', icon: 'School' },
};
