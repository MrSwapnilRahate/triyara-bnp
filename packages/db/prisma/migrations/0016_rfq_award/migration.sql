-- RFQ award: record which supplier won a sourcing round.
--
-- Additive only. Every column is nullable and no existing row is touched:
-- an RFQ that has not been awarded genuinely has no winner.

-- A terminal outcome for the winning participation. Losing bids stay SUBMITTED,
-- because "quoted" and "won" are different facts.
ALTER TYPE "RFQSupplierStatus" ADD VALUE IF NOT EXISTS 'AWARDED';

-- Who won, when, and who decided. `awardedById` carries no foreign key, matching
-- AuditLog.actorId, so sentinel actors remain possible.
ALTER TABLE "RFQ" ADD COLUMN "awardedSupplierId" TEXT;
ALTER TABLE "RFQ" ADD COLUMN "awardedAt" TIMESTAMP(3);
ALTER TABLE "RFQ" ADD COLUMN "awardedById" TEXT;

ALTER TABLE "RFQ"
  ADD CONSTRAINT "RFQ_awardedSupplierId_fkey"
  FOREIGN KEY ("awardedSupplierId") REFERENCES "Supplier"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- "Which RFQs did this supplier win?"
CREATE INDEX "RFQ_organizationId_awardedSupplierId_idx"
  ON "RFQ"("organizationId", "awardedSupplierId");
