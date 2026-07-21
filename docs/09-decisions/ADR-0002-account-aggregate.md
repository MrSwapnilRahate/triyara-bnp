---
id: ADR-0002
title: Account aggregate design
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0002: Account aggregate design

## Context

Account is the canonical Partner entity (TRY-BNP-DB-01) and the aggregate root every
future module extends. It needs org isolation, soft delete, optimistic concurrency,
auditing, cursor listing, and events per ARCH-01 / API-01 / DB-01.

## Decision

- **Aggregate root + one row of truth**: a single `Account` table; sub-entities attach
  later, never duplicate it.
- **Cursor keyset pagination** (opaque base64 of id + Prisma cursor); no offset.
- **Optimistic concurrency** via an integer `version` column surfaced as a weak `ETag`;
  writes require `If-Match` and a versioned `updateMany` (0 rows → `412`).
- **Soft delete** (`deletedAt` + `deletedById`); restore re-checks name uniqueness.
- **Uniqueness** (no duplicate active names per org) enforced in the repository
  transaction (case-insensitive), so soft-deleted names can be reused/restored.
- **Audit in the same transaction** as the mutation (actor, org, before, after,
  requestId) → the audit trail can never drift from the change.
- **Events** emitted by the service on an in-process logging bus (webhook-ready).
- **Authorization** enforced in the service via CASL (`assertAbility`) + org scoping,
  called behind `requireAuth()` at every endpoint.

## Alternatives

- Offset pagination: rejected (unstable under inserts; API-01 mandates cursor).
- DB unique constraint on (org, legalName): rejected — conflicts with soft-delete/restore;
  a partial index is DB-specific, so uniqueness lives in the repo transaction.
- `updatedAt`-based concurrency: rejected in favour of an explicit, monotonic `version`.
- Country FK now: deferred — stored as ISO-2 string until a Country reference table lands.

## Trade-offs

- Repo-level uniqueness has a small race window without a DB constraint (acceptable at
  current scale; a partial unique index can be added later).
- Bulk operations use each row's current version (no per-item If-Match) and report
  partial success.

## Consequences

- Every future module (profiles, contacts, documents, verification) references Account
  and inherits its audit, soft-delete, versioning and org-isolation guarantees.

## References

- TRY-BNP-ARCH-01, TRY-BNP-DB-01, TRY-BNP-API-01, TRY-BNP-DEV-01, TRY-BNP-AUTH-01.
