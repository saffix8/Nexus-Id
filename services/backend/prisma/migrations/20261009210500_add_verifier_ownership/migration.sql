-- Add ownership without breaking existing verifier records.
ALTER TABLE "verifiers"
ADD COLUMN "owner_user_id" UUID;

ALTER TABLE "verifiers"
ADD CONSTRAINT "verifiers_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "verifiers_owner_user_id_idx" ON "verifiers"("owner_user_id");
