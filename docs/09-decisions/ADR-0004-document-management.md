---
id: ADR-0004
title: Document management, storage abstraction & versioning
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0004: Document management, storage abstraction & versioning

## Context

Documents attach to Accounts (and optionally SupplierProfiles) and underpin
verification, compliance and trust (TRY-BNP-DB-01, API-01). Uploads must be
presigned (TDR-01), demonstrable in the browser with no cloud account, and portable
across providers.

## Decision

- **Provider-agnostic `StorageProvider`** interface. Services depend only on it.
  Implementations: **Local** (filesystem with short-lived HMAC-signed upload/download
  URLs that faithfully mirror presigned semantics - zero external infra) and one
  **S3-compatible** adapter for **AWS S3 and Cloudflare R2** (endpoint differs only).
  Provider is chosen from `STORAGE_PROVIDER`; default `local`.
- **Presigned upload flow**: presign &rarr; direct PUT &rarr; confirm &rarr; create.
  File bytes never pass through the app for cloud; the local routes are token-authed
  (no session) exactly like a presigned S3 URL.
- **Immutable versioning**: each replacement creates a new `DocumentVersion` with its own
  storage key; the binary is never overwritten. Current-file metadata is denormalized on
  `Document` for fast list/detail (no N+1).
- **Owners by plain ID**: `accountId` / `supplierProfileId` are plain columns (no Prisma
  relation), so the FROZEN Account and SupplierProfile models are not modified at all;
  integrity + org isolation are enforced in the service.
- **DocumentAudit = central AuditLog**: audit is written to the shared `AuditLog`
  (`entityType='Document'`) rather than a per-entity table - one mechanism, no duplication
  (DB-01, DEV-01).
- Reuse the Account/Supplier concurrency model: integer `version` &rarr; weak ETag +
  If-Match (412), audit in the same transaction; CASL on the `Document` subject; storage
  keys are org-prefixed and verified before create/version.

## Alternatives

- Store files in Postgres: rejected (bloat, slow, no CDN).
- A separate `DocumentAudit` table: rejected - duplicates the audit mechanism.
- Prisma relations to Account/SupplierProfile: rejected here to keep the frozen models
  literally unchanged (no back-relation).
- Overwriting files on replace: rejected - history/immutability required.

## Trade-offs

- Plain-ID ownership loses DB-level cascade/FK from Account to Document (enforced in the
  service instead).
- Local checksum is sha256 (read on stat); S3 uses ETag - duplicate detection is
  strongest on local / within a provider.
- `document.expired` needs a scheduler to run `markExpired` (not yet wired).

## Consequences

- Uploads, versioning, preview/download and lifecycle all work in the browser out of the
  box; swapping to R2/S3 is a config change with no code change in services.

## References

- TRY-BNP-DB-01, TRY-BNP-API-01, TRY-BNP-TDR-01, TRY-BNP-DEV-01, TRY-BNP-AUTH-01,
  ACCOUNT-01, SUPPLIER-01; ADR-0002, ADR-0003.
