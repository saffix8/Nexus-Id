-- AlterTable
ALTER TABLE "verification_requests" ADD COLUMN     "user_id" UUID;

-- CreateTable
CREATE TABLE "device_pairings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code_hash" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "user_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "paired_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pairings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_pairings_code_hash_key" ON "device_pairings"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "device_pairings_secret_hash_key" ON "device_pairings"("secret_hash");

-- CreateIndex
CREATE INDEX "device_pairings_user_id_idx" ON "device_pairings"("user_id");

-- CreateIndex
CREATE INDEX "device_pairings_status_idx" ON "device_pairings"("status");

-- CreateIndex
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

