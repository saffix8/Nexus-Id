-- =============================================================================
-- NexusID — PostgreSQL Database Schema
-- =============================================================================
-- Run order matters: verifiers before verification_requests (FK dependency)
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS
-- Mobile app users. Stores their RSA public key and FCM push token only.
-- NO personal data stored here — credentials live on the device.
-- =============================================================================
CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key  TEXT        NOT NULL,              -- RSA-2048 public key (PEM)
  push_token  TEXT,                              -- FCM device token (nullable until registered)
  device_info JSONB,                             -- { os, model, app_version }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- VERIFIERS
-- Service providers (job portals, companies) that embed NexusID on their sites.
-- =============================================================================
CREATE TABLE verifiers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       TEXT        UNIQUE NOT NULL,      -- e.g. "jobportal.com"
  display_name TEXT        NOT NULL,             -- Shown to users during verification
  logo_url     TEXT,                             -- Optional logo URL
  api_key      TEXT        UNIQUE NOT NULL,      -- For verifier API authentication
  trusted      BOOLEAN     NOT NULL DEFAULT FALSE, -- Admin-approved trust badge
  owner_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verifiers_owner_user_id ON verifiers(owner_user_id);

-- =============================================================================
-- VERIFICATION REQUESTS
-- Created by browser extension when it detects a nexusid-verify element.
-- Expires after 5 minutes if not acted on.
-- =============================================================================
CREATE TABLE verification_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id      UUID        REFERENCES verifiers(id) ON DELETE SET NULL,
  requested_fields TEXT[]      NOT NULL,         -- e.g. ARRAY['degree','graduation_year']
  nonce            TEXT        NOT NULL UNIQUE,  -- Replay attack prevention
  callback_url     TEXT,                         -- Redirect URL after completion (optional)
  page_url         TEXT,                         -- Page that triggered the request
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'completed', 'rejected', 'expired')),
  expires_at       TIMESTAMPTZ NOT NULL,         -- NOW() + 5 minutes at creation
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,                  -- Set when proof submitted
  rejected_at      TIMESTAMPTZ                   -- Set when user rejects
);

-- =============================================================================
-- VERIFICATION RESULTS
-- The actual verified data from a successful proof submission.
-- One-to-one with verification_requests.
-- =============================================================================
CREATE TABLE verification_results (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID        UNIQUE NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  verified_fields JSONB      NOT NULL,           -- { field_name: verified_value, ... }
  issuer         TEXT        NOT NULL,           -- e.g. "hec.gov.pk"
  proof_hash     TEXT        NOT NULL,           -- SHA-256 of submitted proof (audit trail)
  verified_at    TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ISSUER REGISTRY
-- Trusted credential issuers whose public keys we accept.
-- Used during proof verification to validate issuer signatures.
-- =============================================================================
CREATE TABLE issuer_registry (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id   TEXT        UNIQUE NOT NULL,       -- e.g. "nadra.gov.pk"
  name        TEXT        NOT NULL,              -- e.g. "NADRA Pakistan"
  jwks_url    TEXT        NOT NULL,              -- /.well-known/jwks.json endpoint
  public_key  TEXT        NOT NULL,              -- RSA public key (PEM) — cached from JWKS
  active      BOOLEAN     NOT NULL DEFAULT TRUE, -- Set false to distrust an issuer
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- AUDIT LOGS
-- Append-only event log. Metadata only — no personal data, no proof contents.
-- Used for compliance, debugging, and analytics.
-- =============================================================================
CREATE TABLE audit_logs (
  id          BIGSERIAL   PRIMARY KEY,
  event_type  TEXT        NOT NULL,              -- 'verification_request_created', 'proof_verified', etc.
  request_id  UUID,                              -- FK not enforced — audit log must survive deletions
  verifier_id UUID,
  metadata    JSONB,                             -- Arbitrary context (field names, timing, etc.)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- FRAUD FLAGS
-- ML service risk assessments, queued for admin review.
-- =============================================================================
CREATE TABLE fraud_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        REFERENCES verification_requests(id) ON DELETE SET NULL,
  risk_score  NUMERIC(5,2),                      -- 0.00 to 100.00
  risk_level  TEXT        CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  features    JSONB,                             -- ML feature vector used for scoring
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- USED NONCES
-- Replay attack prevention. Once a nonce is used, it lives here permanently.
-- Cleaned up periodically (nonces older than 24h are safe to delete).
-- =============================================================================
CREATE TABLE used_nonces (
  nonce    TEXT        PRIMARY KEY,
  used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- users
CREATE INDEX idx_users_push_token ON users (push_token)
  WHERE push_token IS NOT NULL;                  -- For FCM broadcast queries

-- verification_requests
CREATE INDEX idx_vr_status           ON verification_requests (status);
CREATE INDEX idx_vr_verifier_id      ON verification_requests (verifier_id);
CREATE INDEX idx_vr_expires_at       ON verification_requests (expires_at)
  WHERE status = 'pending';                      -- Efficient expiry sweeps
CREATE INDEX idx_vr_nonce            ON verification_requests (nonce);
CREATE INDEX idx_vr_created_at       ON verification_requests (created_at DESC);

-- verification_results
CREATE INDEX idx_vres_request_id     ON verification_results (request_id);
CREATE INDEX idx_vres_verified_at    ON verification_results (verified_at DESC);
CREATE INDEX idx_vres_issuer         ON verification_results (issuer);

-- audit_logs
CREATE INDEX idx_audit_event_type    ON audit_logs (event_type, created_at DESC);
CREATE INDEX idx_audit_request_id    ON audit_logs (request_id);
CREATE INDEX idx_audit_verifier_id   ON audit_logs (verifier_id);
CREATE INDEX idx_audit_created_at    ON audit_logs (created_at DESC);

-- fraud_flags
CREATE INDEX idx_fraud_status        ON fraud_flags (status);
CREATE INDEX idx_fraud_risk_level    ON fraud_flags (risk_level);
CREATE INDEX idx_fraud_created_at    ON fraud_flags (created_at DESC);

-- used_nonces — for cleanup job (delete nonces older than 24h)
CREATE INDEX idx_nonces_used_at      ON used_nonces (used_at);

-- issuer_registry
CREATE INDEX idx_issuers_active      ON issuer_registry (active)
  WHERE active = TRUE;

-- =============================================================================
-- TRIGGER: auto-update updated_at on users and issuer_registry
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER issuer_registry_set_updated_at
  BEFORE UPDATE ON issuer_registry
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
