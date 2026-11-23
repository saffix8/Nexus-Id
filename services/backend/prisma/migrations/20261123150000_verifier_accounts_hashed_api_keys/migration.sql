-- AlterTable
ALTER TABLE "verifiers" ADD COLUMN     "api_key_prefix" TEXT,
ADD COLUMN     "api_key_rotated_at" TIMESTAMPTZ(6),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "password_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "verifiers_email_key" ON "verifiers"("email");


-- Data: store API keys as SHA-256 hex only (SRS FR-034). Existing plaintext
-- keys are hashed in place, so already-issued keys (e.g. the seeded demo key)
-- keep working; the prefix keeps a non-secret hint for the portal UI.
UPDATE "verifiers"
SET "api_key_prefix" = left("api_key", 8),
    "api_key" = encode(sha256(convert_to("api_key", 'UTF8')), 'hex')
WHERE "api_key" !~ '^[0-9a-f]{64}$';
