-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('pending', 'completed', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "fraud_flag_status" AS ENUM ('pending', 'reviewed', 'dismissed');

-- CreateEnum
CREATE TYPE "risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_key" TEXT NOT NULL,
    "push_token" TEXT,
    "device_info" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "domain" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "api_key" TEXT NOT NULL,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "verifier_id" UUID,
    "requested_fields" TEXT[],
    "nonce" TEXT NOT NULL,
    "callback_url" TEXT,
    "page_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "verified_fields" JSONB NOT NULL,
    "issuer" TEXT NOT NULL,
    "proof_hash" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuer_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issuer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jwks_url" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issuer_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "request_id" UUID,
    "verifier_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID,
    "risk_score" DECIMAL(5,2),
    "risk_level" TEXT,
    "features" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "used_nonces" (
    "nonce" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "used_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "verifiers_domain_key" ON "verifiers"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "verifiers_api_key_key" ON "verifiers"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_nonce_key" ON "verification_requests"("nonce");

-- CreateIndex
CREATE INDEX "verification_requests_status_idx" ON "verification_requests"("status");

-- CreateIndex
CREATE INDEX "verification_requests_verifier_id_idx" ON "verification_requests"("verifier_id");

-- CreateIndex
CREATE INDEX "verification_requests_expires_at_idx" ON "verification_requests"("expires_at");

-- CreateIndex
CREATE INDEX "verification_requests_nonce_idx" ON "verification_requests"("nonce");

-- CreateIndex
CREATE INDEX "verification_requests_created_at_idx" ON "verification_requests"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "verification_results_request_id_key" ON "verification_results"("request_id");

-- CreateIndex
CREATE INDEX "verification_results_request_id_idx" ON "verification_results"("request_id");

-- CreateIndex
CREATE INDEX "verification_results_verified_at_idx" ON "verification_results"("verified_at" DESC);

-- CreateIndex
CREATE INDEX "verification_results_issuer_idx" ON "verification_results"("issuer");

-- CreateIndex
CREATE UNIQUE INDEX "issuer_registry_issuer_id_key" ON "issuer_registry"("issuer_id");

-- CreateIndex
CREATE INDEX "issuer_registry_active_idx" ON "issuer_registry"("active");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_created_at_idx" ON "audit_logs"("event_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "audit_logs_verifier_id_idx" ON "audit_logs"("verifier_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "fraud_flags_status_idx" ON "fraud_flags"("status");

-- CreateIndex
CREATE INDEX "fraud_flags_risk_level_idx" ON "fraud_flags"("risk_level");

-- CreateIndex
CREATE INDEX "fraud_flags_created_at_idx" ON "fraud_flags"("created_at" DESC);

-- CreateIndex
CREATE INDEX "used_nonces_used_at_idx" ON "used_nonces"("used_at");

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_verifier_id_fkey" FOREIGN KEY ("verifier_id") REFERENCES "verifiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "verification_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "verification_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
