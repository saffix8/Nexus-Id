-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "credential_jti" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "credentials_credential_jti_key" ON "credentials"("credential_jti");

