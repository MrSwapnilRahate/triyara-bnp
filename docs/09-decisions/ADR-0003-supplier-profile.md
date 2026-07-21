---
id: ADR-0003
title: SupplierProfile as a 1:1 extension of Account
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0003: SupplierProfile as a 1:1 extension of Account

## Context

Account is the canonical Partner (ADR-0002, frozen). SupplierProfile adds supplier
capabilities without duplicating Account identity (TRY-BNP-DB-01 / EXT-01), 1:1.

## Decision

- **1:1 via a unique `accountId`** on SupplierProfile; the FK lives on SupplierProfile.
  Prisma requires an opposite relation field, so the Account _model_ gains a
  `supplierProfile SupplierProfile?` reference — **column-less; the Account table is
  unchanged and its behaviour is untouched.**
- **Soft-delete + restore semantics for 1:1**: a soft-deleted profile keeps the unique
  `accountId` row; you must **restore** it rather than create a new one (create rejects
  when any profile row exists).
- Reuse the Account concurrency/audit model: integer `version` → weak `ETag` + `If-Match`
  (412 on stale), audit written in the same transaction as the mutation.
- **Capabilities**: `SupplierProduct` is a child table (EXT-01 capability-matrix seed);
  add/remove bump the profile version and emit `supplier.capability_changed`.
  `exportCountries` / `supportedDocuments` / `certifications` are string arrays for now.
- Authorization via CASL on the `SupplierProfile` subject; delete requires the `delete`
  ability (Admin), create/update available to Export Manager.

## Alternatives

- Merge supplier fields onto Account: rejected — bloats the aggregate and couples
  identity to supplier-only concerns.
- Reference tables for certifications/documents/products now: deferred to their own
  modules; interim string arrays keep this phase focused.
- Hard-unique with recreate-after-delete: rejected in favour of restore (preserves
  history and the 1:1 invariant).

## Trade-offs

- String-array capabilities are not yet normalized/queryable as entities (future work).
- Editing fields and changing products in the same session can race on `version`
  (mitigated by refresh-after-mutation).

## Consequences

- Every account can carry exactly one supplier profile with full audit, versioning and
  org isolation; BuyerProfile follows the identical pattern next.

## References

- TRY-BNP-DB-01, TRY-BNP-EXT-01, TRY-BNP-API-01, TRY-BNP-AUTH-01, TRY-BNP-ACCOUNT-01,
  ADR-0002.
