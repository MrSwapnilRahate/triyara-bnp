-- Revoking administrator access (TRY-BNP-SUPERADMIN-01).
--
-- Additive: one enum value and three nullable columns. No existing row is
-- touched, and no existing column changes meaning.

ALTER TYPE "AdminAccessRequestStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

-- Recorded alongside the approval rather than overwriting it: who granted the
-- access and who took it away are different facts.
ALTER TABLE "AdminAccessRequest" ADD COLUMN "revokedById" TEXT;
ALTER TABLE "AdminAccessRequest" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "AdminAccessRequest" ADD COLUMN "revocationReason" TEXT;
