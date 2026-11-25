-- AlterTable
ALTER TABLE "device_pairings" ADD COLUMN     "browser_label" TEXT;

-- CreateTable
CREATE TABLE "portal_sign_ins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code_hash" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "user_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "browser_label" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_sign_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_sign_ins_code_hash_key" ON "portal_sign_ins"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sign_ins_secret_hash_key" ON "portal_sign_ins"("secret_hash");

-- CreateIndex
CREATE INDEX "portal_sign_ins_user_id_idx" ON "portal_sign_ins"("user_id");

-- AddForeignKey
ALTER TABLE "portal_sign_ins" ADD CONSTRAINT "portal_sign_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
