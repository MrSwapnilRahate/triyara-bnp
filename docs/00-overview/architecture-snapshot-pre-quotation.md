---
id: TRY-BNP-SNAPSHOT-01
title: Architecture Snapshot - frozen baseline before Quotation Engine
status: Baseline
frozen_at: a3424399138941b2480c7ad073ec75a07e85b6e8
frozen_tag: v0.13.0-auth-extension
date: 2026-07-30
---

# Architecture Snapshot — pre-Quotation baseline

Frozen state of `main` immediately before the Quotation Engine implementation, recorded
so the delta introduced by that module can be measured rather than estimated.

**Commit:** `a342439` · **Tag:** `v0.13.0-auth-extension`

## Counts

| Metric             |   Count |
| ------------------ | ------: |
| Prisma models      |  **55** |
| Prisma enums       |  **41** |
| Migrations         |  **10** |
| Repositories       |  **25** |
| Services           |  **20** |
| Validation modules |  **12** |
| Seed modules       |   **4** |
| Test files         |  **33** |
| Test cases         | **204** |
| Release tags       |  **11** |

### Test cases by package

| Package            |   Cases |
| ------------------ | ------: |
| `@triyara/core`    |      82 |
| `@triyara/db`      |      66 |
| `apps/web`         |      41 |
| `@triyara/auth`    |      10 |
| `@triyara/storage` |       3 |
| `@triyara/lib`     |       2 |
| **Total**          | **204** |

## Models by module

| Module                                                                                      | Models | Status      |
| ------------------------------------------------------------------------------------------- | -----: | ----------- |
| Frozen identity + accounts (`TRY-BNP-AUTH-01`, `ACCOUNT-01`)                                |      7 | frozen      |
| Frozen business (supplier/buyer profiles, documents, verification, activity, notifications) |     15 | frozen      |
| Product Catalog (`TRY-BNP-CATALOG-S1`)                                                      |      9 | implemented |
| Supplier Management (`TRY-BNP-SUPPLIER-02`)                                                 |     11 | implemented |
| RFQ Management (`TRY-BNP-RFQ-01`)                                                           |      8 | implemented |
| Auth Extension (`TRY-BNP-AUTH-02`)                                                          |      5 | implemented |
| **Total**                                                                                   | **55** |             |

## Migrations

```
0000_init
0001_catalog_extensions
0002_product_catalog
0003_product_catalog_constraints
0004_supplier_management
0005_supplier_constraints
0006_rfq_management
0007_rfq_constraints
0008_auth_extension
0009_auth_extension_constraints
```

Sequentially numbered throughout, so fresh-database order matches recorded-history order.

## API layer

| Module                                |                 Endpoints |
| ------------------------------------- | ------------------------: |
| Product Catalog REST (`/api/catalog`) | 12 + OpenAPI 3.1 document |
| Supplier / RFQ / Quotation            |                 not built |

## Release tags

```
v0.1.0-auth-foundation      v0.6.0-activity          v0.8.0-buyer-profile
v0.2.0-account-aggregate    v0.6.1-governance        v0.12.0-rfq-management
v0.3.0-supplier-profile     v0.7.0-notifications     v0.13.0-auth-extension
v0.4.0-documents
v0.5.0-verification
```

Gap on record: Supplier Management and Catalog API were merged without tags
(`0.10.x` / `0.11.x` are unallocated), and the CHANGELOG has no entries for Supplier
Management, Catalog API or RFQ Management.

## Verified at this baseline

- All 10 migrations replay from an empty database
- Seed runs and is idempotent
- `prisma migrate diff` returns an empty migration — no drift
- CI and security scan green on `a342439`
- Vercel production deployed at `a342439`
- Local gate 5/5 without a database and with a live one (194 test cases executed)

## Expected delta from Quotation Engine

Per the approved design (`TRY-BNP-QUOTE-01`): **+10 models**, **+8 enums**, **+2 migrations**,
reusing `Incoterm`, `CertificationType`, `Product`, `Supplier`, `Account`, `Organization`,
`RFQ`, `RFQItem` and `RFQSupplierResponse` rather than redeclaring them.

Post-implementation targets: **65 models**, **49 enums**, **12 migrations**.
