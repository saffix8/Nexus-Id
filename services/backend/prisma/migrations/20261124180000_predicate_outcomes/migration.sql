-- Predicate-only verification (FR-005, FR-041, FR-043, FR-045 AC6, BR-015, BR-021).

-- Service Provider requirements (API-045/046).
ALTER TABLE "verifiers" ADD COLUMN "required_predicates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The predicate a session asks for.
ALTER TABLE "verification_requests" ADD COLUMN "predicate" TEXT;

-- Results hold outcome, condition, proof hash and issuer only.
ALTER TABLE "verification_results" ADD COLUMN "outcome" TEXT;
ALTER TABLE "verification_results" ADD COLUMN "condition" TEXT;

UPDATE "verification_results" r
SET "outcome" = 'VERIFIED',
    "condition" = COALESCE(q."predicate", q."requested_fields"[1], 'UNKNOWN')
FROM "verification_requests" q
WHERE q."id" = r."request_id";

UPDATE "verification_results" SET "outcome" = 'VERIFIED' WHERE "outcome" IS NULL;
UPDATE "verification_results" SET "condition" = 'UNKNOWN' WHERE "condition" IS NULL;

ALTER TABLE "verification_results" ALTER COLUMN "outcome" SET NOT NULL;
ALTER TABLE "verification_results" ALTER COLUMN "condition" SET NOT NULL;
ALTER TABLE "verification_results" ALTER COLUMN "issuer" DROP NOT NULL;
ALTER TABLE "verification_results" ALTER COLUMN "proof_hash" DROP NOT NULL;

-- BR-015: claim values must not be stored. Drops the values already recorded.
ALTER TABLE "verification_results" DROP COLUMN "verified_fields";
