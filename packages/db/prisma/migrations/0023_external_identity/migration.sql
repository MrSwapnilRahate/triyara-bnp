-- ---------------------------------------------------------------------------
-- External identity foundation (TRY-BNP-EXT-IDENTITY)
--
-- Purely ADDITIVE: one enum value, one nullable column, one index, one nullable
-- foreign key. No existing row is touched, no existing column changes meaning,
-- and no role is granted to anybody.
--
-- Numbered 0023 deliberately: 0019-0021 are reserved for the V3 cost
-- intelligence branch, which is not merged yet.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- An authenticated Buyer or Supplier. ONE member rather than BUYER and
-- SUPPLIER: which party someone is is already recorded on their Account, by
-- whether it carries a buyerProfile or a supplierProfile.
--
-- `IF NOT EXISTS` matches migrations 0014, 0016 and 0018, which add enum values
-- the same way.
--
-- Adding a member cannot affect an existing row: no row can already hold a
-- value that did not exist, and nothing here assigns it.
-- ---------------------------------------------------------------------------
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'EXTERNAL_PARTY';

-- ---------------------------------------------------------------------------
-- The external party a login belongs to. NULL for every existing user, which is
-- every member of internal staff - nothing is backfilled.
--
-- No UNIQUE constraint. Supplier.accountId is unique because it is a 1:1 seam
-- between two records describing the same company; this is many-to-one, because
-- a buyer has more than one person, which BuyerContact already models.
--
-- ON DELETE SET NULL, matching Account_ownerId_fkey: removing an account must
-- not remove the people who could sign in to it.
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN "accountId" TEXT;

CREATE INDEX "User_accountId_idx" ON "User"("accountId");

ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
