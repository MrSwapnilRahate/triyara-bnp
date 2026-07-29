-- Extensions required by the Product Catalog (TRY-BNP-CATALOG-S1).
-- Must precede the catalog tables: the trigram indexes on "Product" are declared
-- in the Prisma datamodel and are created by the next migration, which needs
-- pg_trgm to already exist. btree_gist backs the ProductPrice exclusion
-- constraint. Both are available on Neon.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
