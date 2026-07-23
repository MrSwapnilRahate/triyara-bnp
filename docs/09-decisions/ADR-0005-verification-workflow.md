---
id: ADR-0005
title: Supplier verification workflow (state machine)
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0005: Supplier verification workflow (state machine)

## Context

Suppliers must be verified against their uploaded documents (TRY-BNP-DB-01, PRD-01).
Verification must consume SupplierProfile + Documents without duplicating document logic
or storing files, and must keep an immutable decision trail.

## Decision

- **Explicit state machine** in the service: 8 states with a small allowed-from table per
  action (submit / assign / request-documents / approve / reject / suspend / reopen /
  expire). Illegal transitions raise `ConflictError`.
- **Reference, never store**: `VerificationReview` holds a `documentId` (+ denormalized
  `documentType`); approval reads the Documents module to validate ownership, required
  types, and expiry. No file bytes, no duplicated document logic.
- **Immutable history**: every transition writes a `VerificationHistory` row _and_ a
  central `AuditLog` entry in the same transaction - the decision trail cannot be edited.
- **No relations to frozen models**: Account / SupplierProfile / Document / User are
  referenced by plain ID columns (no Prisma relations, no back-relations), so nothing
  frozen is modified.
- **One active verification** per supplier is enforced in the service (occupying-state
  check); suppliers accumulate attempts over time.
- Reuse the platform concurrency/audit model: integer `version` -> ETag + If-Match (412);
  CASL authorization - only the `verify` ability (Verifier/Admin) may approve/reject/suspend.

## Alternatives

- Encode the state machine in the DB/repository: rejected - business rules belong in the
  service (testable without a DB); the repo stays a transition-applier.
- Copy document metadata into verification: rejected - duplicates the frozen Documents
  module; we reference IDs and read on demand.
- A dedicated verification-audit table only: rejected - the central AuditLog already
  provides org-wide audit; VerificationHistory adds the per-verification timeline.

## Trade-offs

- Referencing documents by ID loses DB-level FK/cascade (enforced in the service).
- Per frozen AUTH-01, only Admin can `create` a verification; role granularity for
  "who starts a verification" follows the existing ability matrix rather than a new one.
- `verification.expired` needs a scheduler to run `markExpired`.

## Consequences

- The full review lifecycle - submit, assign, request docs, review the checklist, approve
  or reject with reasons, suspend, reopen - is demonstrable in the browser and auditable.

## References

- TRY-BNP-DB-01, API-01, DEV-01, AUTH-01, ACCOUNT-01, SUPPLIER-01, DOCUMENT-01;
  ADR-0002, ADR-0003, ADR-0004.
