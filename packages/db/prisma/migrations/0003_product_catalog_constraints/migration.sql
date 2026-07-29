-- Product Catalog invariants that the Prisma schema language cannot express
-- (TRY-BNP-CATALOG-S1). Extensions are created in 0001_catalog_extensions;
-- tables, plain indexes and the pg_trgm indexes in 0002_product_catalog.
--
-- Everything below is deliberately invisible to Prisma's differ (partial
-- indexes, expression indexes, exclusion constraints), so `prisma migrate diff`
-- reports no drift against these objects and will not try to drop them.

-- ---------------------------------------------------------------------------
-- 1. Exactly one PRIMARY image per product, counting live rows only.
-- A partial unique index is the only way to express "at most one row matching
-- a predicate"; Prisma's @@unique cannot carry a WHERE clause.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "ProductImage_one_primary_per_product"
  ON "ProductImage" ("productId")
  WHERE "type" = 'PRIMARY' AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Full-text search over Product.
-- An expression index, not a generated tsvector column: identical performance,
-- but it adds no column the Prisma datamodel is unaware of, so no drift.
--
-- The 'english'::regconfig cast is REQUIRED. Without it the literal resolves to
-- the single-argument to_tsvector(text), which is only STABLE (it depends on
-- default_text_search_config) and is therefore rejected for use in an index
-- with 42P17 "functions in index expression must be marked IMMUTABLE".
--
-- Queries must use this exact expression for the planner to choose the index:
--   WHERE to_tsvector('english'::regconfig,
--           coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' ||
--           coalesce(brand,'') || ' ' || coalesce("shortDescription",''))
--         @@ plainto_tsquery('english', $1)
-- ---------------------------------------------------------------------------
CREATE INDEX "Product_fulltext_idx" ON "Product" USING GIN (
  to_tsvector(
    'english'::regconfig,
    coalesce("name", '') || ' ' || coalesce("sku", '') || ' ' ||
    coalesce("brand", '') || ' ' || coalesce("shortDescription", '')
  )
);

-- ---------------------------------------------------------------------------
-- 3. Live-row partial indexes: keep the hot working set proportional to
-- undeleted rows rather than to every row ever created.
-- ---------------------------------------------------------------------------
CREATE INDEX "Product_live_idx"
  ON "Product" ("organizationId", "status", "isActive")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "Category_live_idx"
  ON "Category" ("organizationId", "parentId", "sortOrder")
  WHERE "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 4. No overlapping validity windows for the same commercial price key.
-- The @@unique in the datamodel only stops an exact duplicate key; it cannot
-- stop two rows whose [validFrom, validTo) ranges overlap. That ambiguity would
-- make "the price on date X" non-deterministic, so it is barred at the database.
--
-- COALESCE wrappers are required because NULL never equals NULL under `WITH =`,
-- which would otherwise silently exempt every row with no port or no MOQ.
--
-- "incoterm" is compared as the enum itself, NOT cast to text: btree_gist
-- supports enum types natively, whereas the enum->text cast is only STABLE and
-- fails with 42P17.
--
-- tsrange (not tstzrange) because Prisma maps DateTime to timestamp(3) without
-- time zone; tstzrange would additionally not be immutable here.
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductPrice"
  ADD CONSTRAINT "ProductPrice_no_overlapping_validity"
  EXCLUDE USING gist (
    "productId" WITH =,
    "incoterm" WITH =,
    (COALESCE("port", '')) WITH =,
    "currency" WITH =,
    (COALESCE("minimumOrderQty", -1)) WITH =,
    tsrange("validFrom", "validTo") WITH &&
  )
  WHERE ("deletedAt" IS NULL AND "isActive");
