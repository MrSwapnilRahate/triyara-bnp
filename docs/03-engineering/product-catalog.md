---
id: TRY-BNP-PRODUCT-01
title: Enterprise Product Catalog
status: Approved
version: v1.0
---

# TRY-BNP-PRODUCT-01 - Enterprise Product Catalog

Central master-data system referenced by every business module (supplier products, buyer
requirements, RFQ, matching, quotations, orders, shipments, analytics, AI). **Not** an
ecommerce catalog.

## Entities

- **Product** - sku, slug, name, descriptions, category, HS code, origin, default unit,
  status (DRAFT/ACTIVE/ARCHIVED), version, soft-delete.
- **ProductCategory** - unlimited hierarchy (parent/children), slug, display order.
- **HSCode**, **UnitOfMeasure**, **PackagingType**, **OriginCountry** - reference lookups.
- **ProductAttribute** + **ProductAttributeValue** - dynamic (EAV) specifications
  (Moisture, Purity, Colour, Protein, Oil, Mesh, Shelf Life, Packaging Grade, ...).
- **ProductPackaging** - product x packaging types.
- **ProductLink** - extension mapping SupplierProduct / BuyerProduct (by ID) to a Product.

## API

`GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `POST /products/:id/restore`,
`GET/POST /categories`, `PATCH/DELETE /categories/:id`,
`GET /hs-codes | /units | /packaging-types | /origin-countries | /product-attributes`,
`GET/POST /product-links`. Standard envelope, cursor pagination, ETag / If-Match / 412.

## Rules & security

Unique SKU/slug; category/HS/unit/origin/packaging validated; dynamic-attribute values
validated by data type. Authorization via the `ReferenceData` subject (read: all; write:
Admin). Org isolation on every query. Audit + `product.*` / `category.*` events per
mutation.

## Integration

Supplier/Buyer products link to catalog products through the **ProductLink extension
service** - the frozen SupplierProfile / BuyerProfile modules are never modified.
