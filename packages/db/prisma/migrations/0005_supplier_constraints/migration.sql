-- Supplier Management invariants that the Prisma schema language cannot express
-- (TRY-BNP-SUPPLIER-02). pg_trgm and btree_gist are created in
-- 0001_catalog_extensions; the trigram indexes themselves are declared in the
-- datamodel so `migrate diff` owns them.

-- ---------------------------------------------------------------------------
-- 1. At most one primary per collection, counting live rows only.
-- A partial unique index is the only way to express "at most one row matching a
-- predicate"; @@unique cannot carry a WHERE clause.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "SupplierContact_one_primary"
  ON "SupplierContact" ("supplierId")
  WHERE "isPrimary" AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "SupplierAddress_one_primary"
  ON "SupplierAddress" ("supplierId")
  WHERE "isPrimary" AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "SupplierBankAccount_one_primary"
  ON "SupplierBankAccount" ("supplierId")
  WHERE "isPrimary" AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Statutory identifiers are unique per tenant ONLY WHEN PRESENT.
-- GST/IEC/PAN are India-specific and null for foreign suppliers; a plain
-- @@unique would make every NULL-bearing row collide.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "Supplier_gst_unique_per_org"
  ON "Supplier" ("organizationId", "gstNumber")
  WHERE "gstNumber" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Supplier_iec_unique_per_org"
  ON "Supplier" ("organizationId", "iecNumber")
  WHERE "iecNumber" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Supplier_pan_unique_per_org"
  ON "Supplier" ("organizationId", "panNumber")
  WHERE "panNumber" IS NOT NULL AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Full-text search over the supplier master.
-- Expression index, not a generated column: same performance, but no column the
-- Prisma datamodel is unaware of, so no drift.
--
-- The 'english'::regconfig cast is REQUIRED. Without it the literal resolves to
-- the single-argument to_tsvector(text), which is only STABLE and is rejected
-- for indexing with 42P17 "functions in index expression must be marked
-- IMMUTABLE".
-- ---------------------------------------------------------------------------
CREATE INDEX "Supplier_fulltext_idx" ON "Supplier" USING GIN (
  to_tsvector(
    'english'::regconfig,
    coalesce("companyName", '') || ' ' || coalesce("legalName", '') || ' ' ||
    coalesce("supplierCode", '') || ' ' || coalesce("city", '')
  )
);

-- ---------------------------------------------------------------------------
-- 4. Live-row partial indexes: keep the hot working set proportional to active
-- suppliers rather than to every supplier ever onboarded.
-- ---------------------------------------------------------------------------
CREATE INDEX "Supplier_live_idx"
  ON "Supplier" ("organizationId", "status", "isVerified")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "SupplierProductOffering_live_idx"
  ON "SupplierProductOffering" ("organizationId", "productId", "status")
  WHERE "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 5. No overlapping capacity windows for the same supplier / product / site.
-- COALESCE wrappers are required because NULL never equals NULL under `WITH =`,
-- which would silently exempt plant-wide (productId IS NULL) rows.
-- tsrange (not tstzrange) because Prisma maps DateTime to timestamp(3) without
-- time zone; tstzrange would additionally not be immutable here.
-- ---------------------------------------------------------------------------
ALTER TABLE "SupplierCapacity"
  ADD CONSTRAINT "SupplierCapacity_no_overlapping_windows"
  EXCLUDE USING gist (
    "supplierId" WITH =,
    (COALESCE("productId", '')) WITH =,
    (COALESCE("addressId", '')) WITH =,
    tsrange("effectiveFrom", "effectiveTo") WITH &&
  )
  WHERE ("deletedAt" IS NULL);

-- ---------------------------------------------------------------------------
-- 6. Sanity bounds. Performance scores drive commercial decisions, so an
-- out-of-range score is barred at the database rather than trusted to callers.
-- ---------------------------------------------------------------------------
ALTER TABLE "SupplierPerformance"
  ADD CONSTRAINT "SupplierPerformance_period_order" CHECK ("periodEnd" > "periodStart"),
  ADD CONSTRAINT "SupplierPerformance_score_bounds" CHECK (
    ("deliveryScore"       IS NULL OR "deliveryScore"       BETWEEN 0 AND 100) AND
    ("qualityScore"        IS NULL OR "qualityScore"        BETWEEN 0 AND 100) AND
    ("communicationScore"  IS NULL OR "communicationScore"  BETWEEN 0 AND 100) AND
    ("documentationScore"  IS NULL OR "documentationScore"  BETWEEN 0 AND 100) AND
    ("responsivenessScore" IS NULL OR "responsivenessScore" BETWEEN 0 AND 100) AND
    ("overallScore"        IS NULL OR "overallScore"        BETWEEN 0 AND 100) AND
    ("onTimeDeliveryRate"  IS NULL OR "onTimeDeliveryRate"  BETWEEN 0 AND 100) AND
    ("rejectionRate"       IS NULL OR "rejectionRate"       BETWEEN 0 AND 100)
  );

ALTER TABLE "SupplierCapacity"
  ADD CONSTRAINT "SupplierCapacity_window_order"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  ADD CONSTRAINT "SupplierCapacity_positive" CHECK ("capacity" > 0);
