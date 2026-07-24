---
id: ADR-0007
title: BuyerProfile as a 1:1 extension of Account
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0007: BuyerProfile as a 1:1 extension of Account

## Context

BuyerProfile adds buyer demand/intent to an Account, 1:1, and must follow the **same
extension pattern as the frozen SupplierProfile** (TRY-BNP-DB-01 / EXT-01, ACCOUNT-01).

## Decision

- **1:1 via a unique `accountId` with a Prisma relation and a column-less back-relation on
  Account** - identical to SupplierProfile:
  - `BuyerProfile.account  Account @relation(fields: [accountId], references: [id], onDelete: Cascade)`
  - `Account.buyerProfile  BuyerProfile?`
- The back-relation on `Account` is **ORM-only and adds no column** - the Account database
  **table is unchanged**. The foreign key lives on the `BuyerProfile` table (a new table),
  giving DB-level referential integrity and cascade, plus ergonomic ORM traversal.
- Reuse the platform model: integer `version` -> ETag + If-Match (412); audit in the same
  transaction; soft-delete + restore (a deleted profile keeps the unique `accountId`);
  `BuyerProduct` child for products-of-interest (EXT-01 intent seed); CASL on the
  `BuyerProfile` subject; delete requires the `delete` ability (Admin).
- Emits `buyer.*` domain events (a legitimate producer). Activity and Notifications ingest
  them automatically via their generic mappers - no change to those frozen modules.

## Alternatives

- **Plain-ID `accountId` with no relation** (initial draft): rejected on review. It would
  keep the Prisma model free of a back-relation, but it is inconsistent with
  SupplierProfile and forgoes DB-level FK/cascade and ORM traversal. Since the back-relation
  is column-less (the Account table is not modified), there is no reason to diverge.
- Merge buyer fields onto Account: rejected - bloats the aggregate.

## Trade-offs

- Adds a foreign-key constraint on `BuyerProfile.accountId` (on the new table, not Account)
  and a column-less relation field on the Account model. Both are desirable: integrity,
  cascade, and a single consistent extension pattern across Supplier and Buyer.

## Consequences

- SupplierProfile and BuyerProfile are structurally identical extensions of Account, each
  with a relation + column-less back-relation, full audit, versioning, org isolation and
  event emission. The demand data seeds EXT-01 intent modelling and future AI matching.

## References

- TRY-BNP-DB-01, EXT-01, API-01, AUTH-01, ACCOUNT-01, SUPPLIER-01, ACTIVITY-01;
  ADR-0003 (SupplierProfile), ADR-0006 (Activity).
