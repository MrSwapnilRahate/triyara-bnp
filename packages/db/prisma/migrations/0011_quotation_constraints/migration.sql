-- Quotation Engine invariants the Prisma schema language cannot express
-- (TRY-BNP-QUOTE-01). pg_trgm and btree_gist are created in
-- 0001_catalog_extensions; the trigram index on Quotation.quotationNumber is
-- declared in the datamodel so migrate diff owns it.

-- ---------------------------------------------------------------------------
-- 1. Exactly one SELECTED supplier per quoted line.
-- Winner selection is a decision, not a preference: two winners on one line
-- would make "who did we award this to" unanswerable.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "QuotationSourceOption_one_selected_per_line"
  ON "QuotationSourceOption" ("quotationItemId")
  WHERE "isSelected" AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. A quoted line is either a catalog product or a free-text description.
-- ---------------------------------------------------------------------------
ALTER TABLE "QuotationItem"
  ADD CONSTRAINT "QuotationItem_product_or_custom"
  CHECK ("productId" IS NOT NULL OR "customProductName" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. Comments are internal-only. Encoding this as a constraint means a future
-- customer-visible-comment feature has to be a deliberate schema change rather
-- than a one-line service edit that leaks internal margin discussion.
-- ---------------------------------------------------------------------------
ALTER TABLE "QuotationComment"
  ADD CONSTRAINT "QuotationComment_internal_only" CHECK ("isInternal");

-- ---------------------------------------------------------------------------
-- 4. Validity and money sanity.
-- ---------------------------------------------------------------------------
ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_validity_order"
    CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom"),
  ADD CONSTRAINT "Quotation_nonnegative_totals" CHECK (
    ("subtotal"      IS NULL OR "subtotal"      >= 0) AND
    ("taxTotal"      IS NULL OR "taxTotal"      >= 0) AND
    ("grandTotal"    IS NULL OR "grandTotal"    >= 0) AND
    ("costTotal"     IS NULL OR "costTotal"     >= 0)
  ),
  ADD CONSTRAINT "Quotation_positive_fx"
    CHECK ("fxRate" IS NULL OR "fxRate" > 0);

ALTER TABLE "QuotationItem"
  ADD CONSTRAINT "QuotationItem_positive_quantity" CHECK ("quantity" > 0),
  ADD CONSTRAINT "QuotationItem_nonnegative_price" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "QuotationItem_nonnegative_cost"
    CHECK ("unitCost" IS NULL OR "unitCost" >= 0);

ALTER TABLE "QuotationSourceOption"
  ADD CONSTRAINT "QuotationSourceOption_nonnegative_price" CHECK ("supplierPrice" >= 0),
  ADD CONSTRAINT "QuotationSourceOption_nonnegative_landed" CHECK ("landedUnitCost" >= 0),
  ADD CONSTRAINT "QuotationSourceOption_positive_fx"
    CHECK ("fxRate" IS NULL OR "fxRate" > 0);

ALTER TABLE "QuotationTax"
  ADD CONSTRAINT "QuotationTax_rate_bounds" CHECK ("ratePercent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "QuotationTax_nonnegative_amount" CHECK ("amount" >= 0);

ALTER TABLE "ExchangeRate"
  ADD CONSTRAINT "ExchangeRate_positive" CHECK ("rate" > 0),
  ADD CONSTRAINT "ExchangeRate_window_order"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  ADD CONSTRAINT "ExchangeRate_distinct_currencies"
    CHECK ("fromCurrency" <> "toCurrency");

ALTER TABLE "PaymentTerm"
  ADD CONSTRAINT "PaymentTerm_advance_bounds"
    CHECK ("advancePercent" IS NULL OR "advancePercent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "PaymentTerm_nonnegative_days"
    CHECK ("netDays" IS NULL OR "netDays" >= 0);

-- ---------------------------------------------------------------------------
-- 5. No overlapping FX validity windows for the same currency pair.
-- Two live rates for one pair on one date would make a quotation's conversion
-- non-deterministic. Requires btree_gist.
--
-- tsrange (not tstzrange) because Prisma maps DateTime to timestamp(3) without
-- time zone; tstzrange would additionally not be immutable here.
-- ---------------------------------------------------------------------------
ALTER TABLE "ExchangeRate"
  ADD CONSTRAINT "ExchangeRate_no_overlapping_windows"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "fromCurrency" WITH =,
    "toCurrency" WITH =,
    tsrange("effectiveFrom", "effectiveTo") WITH &&
  );

-- ---------------------------------------------------------------------------
-- 6. Full-text search over the quotation header.
-- Expression index, not a generated column: same performance, no column the
-- Prisma datamodel is unaware of, so no drift.
--
-- The 'english'::regconfig cast is REQUIRED. Without it the literal resolves to
-- the single-argument to_tsvector(text), which is only STABLE and is rejected
-- for indexing with 42P17 "functions in index expression must be marked
-- IMMUTABLE".
-- ---------------------------------------------------------------------------
CREATE INDEX "Quotation_fulltext_idx" ON "Quotation" USING GIN (
  to_tsvector(
    'english'::regconfig,
    coalesce("quotationNumber", '') || ' ' || coalesce("title", '')
  )
);

-- ---------------------------------------------------------------------------
-- 7. Live-row partial indexes: keep the hot working set proportional to current
-- quotations rather than to every revision ever issued.
-- ---------------------------------------------------------------------------
CREATE INDEX "Quotation_live_idx"
  ON "Quotation" ("organizationId", "status", "validUntil")
  WHERE "deletedAt" IS NULL;

-- The supplier-comparison read: cheapest landed cost for a line.
CREATE INDEX "QuotationSourceOption_landed_idx"
  ON "QuotationSourceOption" ("quotationItemId", "landedUnitCost")
  WHERE "deletedAt" IS NULL;

-- Current-revision lookups exclude superseded documents.
CREATE INDEX "Quotation_current_revision_idx"
  ON "Quotation" ("organizationId", "quotationNumber", "revisionNumber")
  WHERE "deletedAt" IS NULL AND "supersededAt" IS NULL;
