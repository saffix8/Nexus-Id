-- AlterTable
ALTER TABLE "verification_requests" ADD COLUMN     "poll_secret_hash" TEXT,
ADD COLUMN     "relayed_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_poll_secret_hash_key" ON "verification_requests"("poll_secret_hash");

