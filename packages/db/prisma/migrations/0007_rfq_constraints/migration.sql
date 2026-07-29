-- RFQ Management invariants the Prisma schema language cannot express
-- (TRY-BNP-RFQ-01). pg_trgm is created in 0001_catalog_extensions; the trigram
-- index on RFQ.rfqNumber is declared in the datamodel so migrate diff owns it.

-- ---------------------------------------------------------------------------
-- 1. Exactly one CURRENT response per supplier per line.
-- Re-submission inserts a new revision row and flips isCurrent, which is what
-- makes price history possible; only one of them may be live at a time.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "RFQSupplierResponse_one_current_per_line"
  ON "RFQSupplierResponse" ("rfqSupplierId", "rfqItemId")
  WHERE "isCurrent" AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. A line is either a catalog product or a free-text request.
-- Buyers ask for goods that are not catalogued yet; refusing the RFQ until a
-- product exists would put data entry in front of a sales conversation.
-- ---------------------------------------------------------------------------
ALTER TABLE "RFQItem"
  ADD CONSTRAINT "RFQItem_product_or_custom"
  CHECK ("productId" IS NOT NULL OR "customProductName" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. Buyer presence matches the RFQ type: a BUYER rfq has an external Account,
-- an INTERNAL one does not need a sentinel buyer row.
-- ---------------------------------------------------------------------------
ALTER TABLE "RFQ"
  ADD CONSTRAINT "RFQ_buyer_matches_type"
  CHECK (("type" = 'BUYER' AND "buyerId" IS NOT NULL) OR "type" = 'INTERNAL');

-- ---------------------------------------------------------------------------
-- 4. Comments are internal-only. Encoding this as a constraint means a future
-- "message the supplier" feature has to be a deliberate schema change rather
-- than a one-line service edit that quietly leaks negotiating positions.
-- ---------------------------------------------------------------------------
ALTER TABLE "RFQComment"
  ADD CONSTRAINT "RFQComment_internal_only" CHECK ("isInternal");

-- ---------------------------------------------------------------------------
-- 5. Date and economic sanity.
-- ---------------------------------------------------------------------------
ALTER TABLE "RFQ"
  ADD CONSTRAINT "RFQ_deadline_before_shipment"
  CHECK (
    "quotationDeadline" IS NULL
    OR "expectedShipmentDate" IS NULL
    OR "quotationDeadline" <= "expectedShipmentDate"
  );

ALTER TABLE "RFQItem"
  ADD CONSTRAINT "RFQItem_positive_quantity" CHECK ("quantity" > 0),
  ADD CONSTRAINT "RFQItem_nonnegative_target"
    CHECK ("targetPrice" IS NULL OR "targetPrice" >= 0);

ALTER TABLE "RFQSupplierResponse"
  ADD CONSTRAINT "RFQSupplierResponse_nonnegative_price" CHECK ("price" >= 0),
  ADD CONSTRAINT "RFQSupplierResponse_nonnegative_moq"
    CHECK ("moq" IS NULL OR "moq" >= 0);

-- ---------------------------------------------------------------------------
-- 6. Full-text search over the RFQ header.
-- Expression index, not a generated column: same performance, but no column the
-- Prisma datamodel is unaware of, so no drift.
--
-- The 'english'::regconfig cast is REQUIRED. Without it the literal resolves to
-- the single-argument to_tsvector(text), which is only STABLE and is rejected
-- for indexing with 42P17 "functions in index expression must be marked
-- IMMUTABLE".
-- ---------------------------------------------------------------------------
CREATE INDEX "RFQ_fulltext_idx" ON "RFQ" USING GIN (
  to_tsvector(
    'english'::regconfig,
    coalesce("rfqNumber", '') || ' ' || coalesce("title", '') || ' ' ||
    coalesce("description", '')
  )
);

-- ---------------------------------------------------------------------------
-- 7. Live-row partial indexes: keep the hot working set proportional to open
-- RFQs rather than to every RFQ ever raised.
-- ---------------------------------------------------------------------------
CREATE INDEX "RFQ_live_idx"
  ON "RFQ" ("organizationId", "status", "quotationDeadline")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "RFQSupplier_live_idx"
  ON "RFQSupplier" ("organizationId", "supplierId", "status")
  WHERE "deletedAt" IS NULL;

-- The comparison read: cheapest current quote for a line.
CREATE INDEX "RFQSupplierResponse_current_price_idx"
  ON "RFQSupplierResponse" ("rfqItemId", "price")
  WHERE "isCurrent" AND "deletedAt" IS NULL;
