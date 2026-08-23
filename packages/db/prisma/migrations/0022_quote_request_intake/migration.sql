-- ---------------------------------------------------------------------------
-- Public quote request intake (TRY-BNP-QR-01)
--
-- Purely ADDITIVE. No existing table is altered and no existing constraint is
-- relaxed - in particular `RFQ_buyer_matches_type` from 0007 is left exactly as
-- it is, which is why anonymous submissions land here rather than in RFQ.
--
-- Numbered 0022 deliberately: 0019-0021 are reserved for the V3 cost
-- intelligence branch, which is not merged yet. The two sets are independent,
-- so they may land in either order.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'QUALIFIED', 'PROMOTED', 'REJECTED');

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'PUBLIC_WEBSITE',
    "product" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "monthlyVolume" TEXT,
    "packaging" TEXT,
    "targetPrice" TEXT,
    "destinationPort" TEXT,
    "timeline" TEXT,
    "requirements" TEXT,
    "companyName" TEXT,
    "businessType" TEXT,
    "country" TEXT,
    "importExperience" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "preferredContact" TEXT,
    "leadScore" TEXT,
    "buyerAccountId" TEXT,
    "rfqId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_rfqId_key" ON "QuoteRequest"("rfqId");

-- CreateIndex
CREATE INDEX "QuoteRequest_organizationId_status_createdAt_idx" ON "QuoteRequest"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteRequest_organizationId_buyerAccountId_idx" ON "QuoteRequest"("organizationId", "buyerAccountId");

-- CreateIndex
CREATE INDEX "QuoteRequest_organizationId_createdAt_idx" ON "QuoteRequest"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_organizationId_reference_key" ON "QuoteRequest"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Human-readable intake reference, e.g. "QR-2026-000042".
--
-- A sequence rather than a MAX()+1 read: this endpoint is unauthenticated and
-- concurrent submissions are expected, so the counter has to be safe without
-- taking a lock. Deliberately a SEPARATE series from RFQ.rfqNumber - most leads
-- never become an RFQ, and burning commercial numbers on them would make the
-- RFQ series meaningless.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE "QuoteRequest_reference_seq" START 1;

-- ---------------------------------------------------------------------------
-- PROMOTED is the state that asserts "an RFQ was raised from this". The row
-- must therefore name one; otherwise the status is a claim nothing backs.
-- ---------------------------------------------------------------------------
ALTER TABLE "QuoteRequest"
  ADD CONSTRAINT "QuoteRequest_promoted_has_rfq"
  CHECK ("status" <> 'PROMOTED' OR "rfqId" IS NOT NULL);
