---
id: ADR-0009
title: Enterprise Product Catalog (master data)
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0009: Enterprise Product Catalog (master data)

## Context

The platform needs one central product master-data system that every future module
(supplier products, buyer requirements, RFQ, matching, quotations, orders, shipments,
analytics, AI) references - not an ecommerce catalog. It must not modify any frozen
module (TRY-BNP-DB-01, ACCOUNT/SUPPLIER/BUYER/DOCUMENT/VERIFICATION/ACTIVITY/NOTIFICATION,
AUTH).

## Decision

- **Product aggregate** with reference dimensions: `ProductCategory` (unlimited
  self-referencing hierarchy), `HSCode`, `UnitOfMeasure`, `PackagingType`,
  `OriginCountry`. Unique `sku` and `slug` per org.
- **Dynamic attributes via EAV**: `ProductAttribute` (definitions: key/label/dataType/unit)
  - `ProductAttributeValue` (per-product values). Specifications are never hard-coded;
    products support unlimited attributes, validated against the definition's data type.
- **Authorization via the `ReferenceData` CASL subject** (already in the frozen ability
  model): read for all roles, write for Admin. This honours frozen AUTH-01 without adding a
  `Product` subject.
- Reuse the platform model: integer `version` -> ETag + If-Match (412); soft-delete +
  restore (a deleted product keeps its unique SKU - restore rather than recreate); audit
  in the same transaction; cursor pagination + search + advanced filters. Emits
  `product.*` and `category.*` events (auto-ingested by Activity and Notifications).
- **Integration by extension only**: a new `ProductLink` join maps a frozen
  SupplierProduct / BuyerProduct (by plain ID) to a catalog `Product`. The frozen tables
  are **never modified**; the link + link-service are the "extension service" the phase
  requires.

## Alternatives

- Hard-coded specification columns per product type: rejected - not extensible; EAV
  supports unlimited attributes.
- Add a `Product` CASL subject: rejected - AUTH is frozen; `ReferenceData` fits master data.
- Add `productId` FKs onto SupplierProduct / BuyerProduct: rejected - those tables are
  frozen; the `ProductLink` extension provides the mapping instead.

## Trade-offs

- EAV attribute values are stored as strings (typed by the attribute definition) - typed
  querying is deferred; adequate for master data + validation.
- A soft-deleted product retains its unique SKU (restore, don't recreate) - correct for
  permanent master identifiers.

## Consequences

- One queryable source of product truth that every future module references; supplier and
  buyer product rows can be linked to it without touching their frozen modules.

## References

- TRY-BNP-DB-01, EXT-01, API-01, DEV-01, AUTH-01; SUPPLIER-01, BUYER-01; ADR-0003, 0007.
