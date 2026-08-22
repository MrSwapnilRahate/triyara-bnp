---
id: ADR-0012
title: Export cost intelligence (V3)
status: Accepted
date: 2026-08-22
deciders: [Platform]
---

# ADR-0012: Export cost intelligence (V3)

## Context

V3 introduces a freight and export cost intelligence layer: a user selects a product, an
origin and destination, a shipping mode and a quantity, and gets back EXW, FOB, CFR and CIF
values, landed cost, cost per unit, profit and margin - with every figure able to explain the
formula that produced it.

The obvious way to build that is a new costing domain. Repository inspection shows that would
be duplication. **Most of the machinery already exists inside the quotation domain**, built for
TRY-BNP-QUOTE-01:

- `packages/core/src/quotation/quotation-pricing.ts` is a pure, I/O-free pricing engine that
  evaluates charges as **ordered conditions** (the SAP condition technique): each condition
  resolves against a base that may already include earlier conditions, so `sequence` is
  significant and discounts are charges carrying `isDeduction`, not a separate concept.
- `enum Incoterm` already holds all eleven terms - EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP,
  DAP, DPU, DDP.
- `enum ChargeType` already holds the twelve cost components V3 needs: FREIGHT, INSURANCE,
  PACKING, SAMPLING, HANDLING, INSPECTION, CERTIFICATION, DOCUMENTATION, BANK_CHARGES,
  DISCOUNT, SURCHARGE, OTHER.
- `enum ChargeCalculationBasis` already holds the five formula shapes: FIXED_AMOUNT,
  PERCENTAGE, PER_UNIT, PER_WEIGHT, PER_CONTAINER.
- `enum TaxType` already includes CUSTOMS_DUTY.
- `ExchangeRate` already stores `Decimal(18,8)` rates with `effectiveFrom` / `effectiveTo` and
  a `source`, and `Quotation` already snapshots `fxRate` / `fxRateDate` onto the record.
- `ProductPrice` is already an Incoterm-and-port-scoped price book, unique on
  `(productId, incoterm, port, currency, minimumOrderQty, validFrom)`.

Four things are genuinely missing, and they are what V3 has to supply:

1. **The engine computes in float64.** Money is `Decimal(18,4)` in the schema - the schema
   comment states the rule - but `quotation-pricing.ts` normalises to `number` and calls
   `round4` after every operation. Rounding at each step compounds error rather than
   containing it. For a system whose entire output is money, that is the central risk.
2. **There is no cargo model.** `Product` carries `hsCode` but no weight, volume or
   dimensions. The engine says so itself: PER_WEIGHT and PER_CONTAINER "carry their own
   pre-computed amount: weight and container count are not properties of a quotation line."
   Freight cannot be derived without them.
3. **Ports are unstructured.** Country is disciplined as `Char(2)` and currency as `Char(3)`,
   but `port` is a free-text `String?` in four places. Comparing origin ports is impossible
   against free text.
4. **There is no pre-commercial artefact.** `Quotation` requires a `buyerId` and a
   `quotationNumber`, and carries an approval, revision and status lifecycle. A hypothetical
   such as "what would this cost from Nhava Sheva instead?" cannot be represented without
   manufacturing a commercial document.

## Decision

**V3 extends the existing costing vocabulary rather than duplicating it.** Every enum above is
reused verbatim. No parallel Incoterm list, no second charge taxonomy, no competing tax model.

- **`quotation-pricing.ts` is frozen and will not be touched in V3.** A sent quotation is a
  commercial commitment whose arithmetic is deliberately persisted rather than recomputed on
  read. Changing how that arithmetic works - even to improve it - risks altering figures a
  buyer has already been given. The new kernel is built alongside it. Any future migration of
  the quotation engine onto the kernel must happen behind a differential test proving
  identical output across generated cases, and is out of scope for V3.

- **Money is Decimal end to end in the new kernel.** A `@triyara/money` package wraps decimal
  arithmetic; the kernel never sees a `number`. Precision is carried at full width through the
  whole chain and rounded **once, at presentation**, half-up to four decimal places to match
  `Decimal(18,4)`. Money crosses the API boundary as a **string**, because JSON `number`
  silently loses precision past 2^53.

- **`CostScenario` is a pre-commercial aggregate.** It is a working calculation workspace, not
  a commercial record: `buyerId` is optional, there is no scenario number, and there is no
  approval or send lifecycle. That distinction is what lets a user model six alternatives
  without creating six quotations. It is organization-scoped, soft-deleted, and versioned with
  `If-Match` like every other V2 aggregate.

- **A new CASL subject, `CostScenario`.** Authorization is not borrowed from `Quotation`:
  reusing it would grant scenario access to everyone holding quotation rights and the reverse,
  which conflates a private cost exploration with a document sent to a buyer. Adding a subject
  is the established pattern here - ADR-era work added `AuditLog` and `Supplier` the same way,
  and the `SUBJECTS` const array makes the addition a typed, contained change.
  **No existing role grant is modified.** EXPORT_MANAGER holds create, read, update, delete and
  restore; ADMIN holds manage; VERIFIER and READ_ONLY read.

- **`Port` and `ContainerType` are structured global reference data.** Ports are keyed by
  UN/LOCODE. The seed is **curated, not bulk-imported**: major Indian export ports plus the
  ports of the markets Triyara actually serves. The import path is designed so the dataset can
  grow later without a schema change - adding rows, never columns. Reading them is
  `read ReferenceData`; managing them is `manage ReferenceData`, both of which already exist.

- **`FreightRate` is organization-scoped, never global.** A negotiated freight rate is
  commercially sensitive; one organization's rate must never be visible to another. Manual
  entry remains available as an override at all times, because a rate table that blocks an
  urgent calculation is worse than no rate table.

- **Calculation results are frozen and engine-versioned.** `CostScenario` records the
  `engineVersion` that produced its stored figures. Recalculating under a newer engine writes a
  new result rather than mutating the old one, so a figure quoted to a colleague last month can
  still be explained. This mirrors the reasoning already stated at the top of
  `quotation-pricing.ts`.

- **Every calculated line is explainable.** The engine emits, per component, the inputs, the
  formula applied, the intermediate value and the result. A cost engine that cannot show its
  working will be trusted anyway, which is precisely why it must be able to.

## Alternatives

- **Build a standalone costing domain with its own Incoterm and charge enums**: rejected. It
  would duplicate four enums and an ordered-condition engine that already work and are tested,
  and the two vocabularies would drift the first time either changed.

- **Extend `Quotation` with a `isDraftScenario` flag instead of a new aggregate**: rejected.
  It would put hypotheticals into the same table as commercial commitments, where every
  quotation query, listing, approval path and permission check would need to remember to
  exclude them. One forgotten filter shows a buyer a number nobody meant to send.

- **Refactor `quotation-pricing.ts` to Decimal as part of V3**: rejected for V3. It is the
  right eventual destination, but it changes the arithmetic of records that have already been
  sent, and it couples V3's delivery to a regression risk in V2's most commercially sensitive
  domain. Deferred behind differential testing.

- **Reuse `Quotation` abilities for scenarios**: rejected - see above.

- **Global admin-managed freight rates**: rejected. Cross-tenant disclosure of negotiated
  commercial terms.

- **Supplier- or provider-submitted freight quotes**: rejected for V3. `FreightProvider` and
  `FreightQuote` are marketplace concepts and belong to V4.

- **Automatic duty and tax lookup by HS code**: rejected for V3. It requires a maintained
  tariff data source whose accuracy would be relied upon commercially. Manual `CUSTOMS_DUTY`
  and tax components are sufficient and honest about their provenance.

## Trade-offs

- **Two pricing engines exist during V3.** `quotation-pricing.ts` in float for quotations, the
  Decimal kernel for scenarios. This is deliberate duplication, time-boxed by the intent to
  migrate later, and it is the cost of not putting V2's commercial arithmetic at risk. Until
  the migration happens, a quotation total and a scenario total computed from identical inputs
  may differ in the fourth decimal place.

- **`Product` gains four nullable columns** - `netWeight`, `grossWeight`, `weightUnit`,
  `volumeCbm`. Adding fields to an existing V2 entity needs justification: without them every
  scenario re-keys cargo data by hand and per-weight freight cannot be derived at all. All are
  nullable, so existing products and every V2 code path are unchanged.

- **Ports become structured, but existing free-text `port` fields stay as they are.**
  `Quotation.destinationPort`, `ProductPrice.port` and the supplier offering fields keep their
  `String?` shape in V3. Migrating them is a data-quality exercise with no V3 benefit and a
  real risk of breaking existing records.

- **A curated port seed will be incomplete on day one.** A user may need a port that is not
  yet in the list. That is accepted in exchange for a dataset whose every row has been checked;
  the import mechanism exists to close the gap without a migration.

- **Scenario comparison is deferred to a later V3 phase.** The schema makes it nearly free -
  a scenario is already a standalone row - so nothing about the MVP forecloses it.

## Consequences

- V3 ships as ten reviewable phases: the money kernel first (no schema impact, independently
  testable), then reference data, then the aggregate, then the engine, then UI, saved
  scenarios, freight rates, comparison, and a hardening and closure pass.
- The calculation engine phase carries the highest correctness risk in V3 and receives the
  heaviest test and mutation investment. A cost engine that is subtly wrong is worse than
  none, because it will be believed.
- The new `CostScenario` subject widens the `SUBJECTS` union; the derived-union type will
  force every ability call site to remain exhaustive.
- Existing V1 and V2 behaviour, tenant isolation, CASL boundaries, `If-Match` concurrency,
  soft-delete conventions, audit logging and the existing test gates are preserved unchanged
  by every phase.

### V3 / V4 boundary

V3 is **private cost intelligence for one organization**. V4 is **marketplace and network
effects** - public supplier and buyer discovery, an RFQ marketplace, trade leads, messaging,
ratings, logistics partners and payments. None of those are built in V3.

Four V3 decisions are made specifically so V4 is not blocked later:

- `Port` and `ContainerType` are **global** reference data, so they can be shared across
  organizations without re-modelling.
- `FreightRate` is org-scoped but carries a provider-shaped schema, so a `FreightProvider`
  relation can be added without reworking existing rows.
- `CostScenario.buyerId` is **optional**, so a calculation is never permanently bound to one
  buyer.
- The engine is **pure and versioned**, and money crosses boundaries as a string, so the same
  calculation can later serve a public estimate endpoint without precision loss.

## References

- `packages/core/src/quotation/quotation-pricing.ts` - the frozen ordered-condition engine
- `packages/db/prisma/schema.prisma` - `Incoterm`, `ChargeType`, `ChargeCalculationBasis`,
  `ChargeScope`, `TaxType`, `ExchangeRate`, `ProductPrice`, `QuotationCharge`, `QuotationTax`
- ADR-0011 - the precedent for extending a frozen module rather than unfreezing it
- TRY-BNP-QUOTE-01 - the quotation pricing requirement this builds on
