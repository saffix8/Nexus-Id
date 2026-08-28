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
  subject: string;         // CNIC, degree number, etc.
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

export type VerificationStatus = 'pending' | 'completed' | 'rejected' | 'expired';

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
