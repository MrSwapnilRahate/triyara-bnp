# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/); versions follow SemVer.

## [0.5.0-verification] - 2026-07-21

### Added

- **Supplier Verification workflow** (TRY-BNP-VERIFICATION-01) - a guarded state machine
  over the frozen SupplierProfile + Documents modules:
  - Prisma `Verification` + `VerificationReview` (per-document checklist) +
    `VerificationNote` + `VerificationHistory` (immutable) + enums. All references to
    Account / SupplierProfile / Document / User are **plain IDs** (no relations) - the
    frozen modules are untouched.
  - **8 states** (Draft, Pending Review, Documents Requested, In Review, Verified,
    Rejected, Suspended, Expired) with guarded transitions: submit, assign, request
    documents, approve, reject, suspend, reopen, expire.
  - **Consumes documents by reference only** - verification never stores files; the
    checklist references `documentId`, and approval validates required types + document
    ownership + expiry against the Documents module.
  - Business rules: one active verification per supplier; reviewer must be Verifier/Admin;
    approval requires every required document type to have an accepted, unexpired document.
  - Repository: explicit selects, versioned + audited transitions that also write the
    immutable history, checklist reviews, notes, cursor list, `markExpired`.
  - Service (`@triyara/core`): the full state machine; CASL-checked (only Verifier/Admin
    approve), org-isolated; emits all nine `verification.*` events.
  - API: create / list / get / patch / submit / request-documents / assign / approve /
    reject / suspend / reopen / history / notes / review-document; ETag / If-Match / 412.
  - UI: **Verification Queue** + **Verification Details** - supplier summary, required-docs
    checklist with accept/reject, review notes, status history timeline, and approve /
    reject / request-documents / assign / suspend dialogs; loading / empty / error / success.
  - Audit row + immutable history entry on every transition.
  - Tests: state-machine service unit (7) + guarded repository integration + a full
    workflow e2e (create -> accept document -> approve).

### Notes

- Account, SupplierProfile, Documents and Authentication are unchanged.
- Per the frozen AUTH-01 ability matrix, creating a verification requires the `create`
  ability on `Verification` (Admin); Verifier/Admin drive the review + decisions.
- `verification.expired` is emitted by `service.markExpired` (wire to a scheduler later).
- See `docs/09-decisions/ADR-0005-verification-workflow.md`.

## [0.4.0-documents] - 2026-07-21

### Added

- **Document Management module** (TRY-BNP-DOCUMENT-01) - the foundation for
  verification, compliance and trust:
  - **Storage abstraction** (`@triyara/storage`): a `StorageProvider` interface with a
    **Local** provider (HMAC-signed URLs, zero-config, fully browser-demonstrable) and an
    **S3-compatible** adapter serving both **AWS S3 and Cloudflare R2** (presigned). No
    provider-specific logic ever enters services.
  - **Presigned upload flow**: presign &rarr; PUT to storage &rarr; confirm &rarr; create
    record; size + sha256 checksum read from storage; mime/size validation; duplicate
    detection by checksum per account + type.
  - **Versioning**: every replacement adds an immutable `DocumentVersion` with its own
    storage key - binaries are never overwritten; history is preserved.
  - Prisma `Document` + `DocumentVersion` + `DocumentType` / `DocumentStatus`; owners
    referenced by **plain ID** so Account and SupplierProfile are **untouched**.
  - Repository: explicit selects, versioned + audited transactional mutations, cursor
    list with filters (type / status / expiry / search / account), `markExpired`.
  - Service (`@triyara/core`): CRUD + restore + replace-version + download/preview URLs;
    CASL-checked, org-isolated, storage-key org-scoped; emits `document.uploaded /
updated / deleted / restored / version_created / expired`.
  - API: `presign`, `POST/GET /documents`, `GET/PATCH/DELETE /documents/:id`,
    `/restore`, `/version`, `/download` + token-authed local `storage/upload|download`;
    ETag / If-Match / 412.
  - UI: **Documents page** - upload dialog (full presign flow), table, filters, preview,
    download, replace-version, delete, restore, pagination, and loading/empty/error/success.
  - Audit row + domain event on every mutation.
  - Tests: storage unit (3) + service unit (6) + guarded repository integration + a real
    upload e2e.

### Notes

- **Account and SupplierProfile are unchanged** - documents reference them by ID (no
  Prisma relations, no back-relations).
- **DocumentAudit** is realized via the central `AuditLog` (`entityType = 'Document'`)
  per DB-01 - the audit mechanism is not duplicated per entity.
- Default storage is **Local** (no cloud creds needed); set `STORAGE_PROVIDER=s3|r2` +
  credentials for cloud.
- `document.expired` is emitted by `service.markExpired`; wire it to a scheduler later.
- See `docs/09-decisions/ADR-0004-document-management.md`.

## [0.3.0-supplier-profile] - 2026-07-21

### Added

- **SupplierProfile** (TRY-BNP-SUPPLIER-01) — a **1:1 extension of Account**; Account
  owns identity, SupplierProfile owns supplier capabilities:
  - Prisma `SupplierProfile` + `SupplierProduct` + `ManufacturingType` enum. The Account
    model gains only a **column-less back-relation** (Prisma requirement); the Account
    table is unchanged.
  - Repository: explicit select, versioned + audited **transactional** mutations,
    product-capability add/remove, org-scoped; one profile per account enforced.
  - Service (`@triyara/core`): create / read / update / delete / restore + product
    capabilities; CASL-checked, org-isolated; emits `supplier.created / updated /
deleted / restored / capability_changed`.
  - Shared Zod DTOs; API `/accounts/:id/supplier-profile` (+ `/restore`, `/products`,
    `/products/:productId`) with **ETag / If-Match / 412** and version increments.
  - UI: tabbed supplier profile (Overview / Capabilities / Markets / Documents /
    Certifications / Settings) with create / edit / delete / restore, product
    management, and loading / error / success states.
  - **Audit** row + domain event on every mutation.
  - Tests: service unit (5) + guarded repository integration + Playwright e2e.

### Notes

- The **Account aggregate is unchanged** — only a Prisma back-relation was added (no
  column, no behaviour change).
- BuyerProfile, Contacts, Addresses, Documents, Verification remain unimplemented.
- `certifications`, `supportedDocuments`, `exportCountries` are string arrays for now
  (future FKs to reference tables); `socialLinks` is JSON.
- See `docs/09-decisions/ADR-0003-supplier-profile.md`.

## [0.2.0-account-aggregate] - 2026-07-21

### Added

- **Account aggregate** (TRY-BNP-ACCOUNT-01) — the canonical Partner entity every
  future module extends:
  - Prisma `Account` + `AuditLog` models and `RelationshipStatus` enum (Account only;
    no Supplier/Buyer profiles, Contacts, Addresses, Documents or Verification).
  - Repository with explicit selects, **cursor keyset pagination** (never offset),
    versioned + audited **transactional** mutations, organization-scoped queries.
  - Domain service (`@triyara/core`): create / read / list / update / soft-delete /
    restore / assign / status / bulk — ability-checked, org-isolated, emitting
    `account.*` events.
  - Shared Zod DTOs (create/update/list/assign/status/bulk) with strict inference.
  - API `/api/v1/accounts` (9 endpoints): standard envelope, **ETag / If-Match / 412**,
    version increments, per-user write rate limiting.
  - UI: accounts list, table, filters, create/edit/delete/restore dialogs, bulk toolbar,
    cursor pagination, and loading / empty / error / success states.
  - **AuditLog** row on every mutation (actor, org, before, after, requestId, timestamp).
  - Tests: service unit (4) + guarded repository integration + Playwright e2e.

### Notes

- SupplierProfile / BuyerProfile / Contacts / Addresses / Documents / Verification
  remain unimplemented (future modules attach to Account).
- `country` is an ISO-3166 alpha-2 string for now (future FK to a Country table).
- See `docs/09-decisions/ADR-0002-account-aggregate.md`.

## [0.1.0-auth-foundation] - 2026-07-21

### Added

- **Authentication & authorization foundation** (TRY-BNP-AUTH-01):
  - NextAuth (Auth.js v5) Credentials provider, JWT session strategy (8-hour expiry),
    secure httpOnly / SameSite cookies.
  - CASL ability factory with per-role permissions for the four roles
    (Admin, Export Manager, Verifier, Read-Only).
  - Identity Prisma schema in `@triyara/db`: Organization, User, Role, UserRole,
    PasswordResetToken (identity only — no business entities).
  - Typed context helpers: `requireAuth`, `requireRole`, `requireAbility`,
    `currentUser`, `currentOrganization` (org isolation resolved per request).
  - Edge middleware route protection: public / protected / admin.
  - Login, logout, forgot-password and reset-password flows (server actions).
  - Security: bcrypt password hashing (cost 12), per-email login rate limiting,
    token-hash password resets with expiry, no user enumeration.
  - Tests: unit (abilities, guards, password, rate limiter — 10 tests) plus
    database-guarded integration and Playwright e2e specs.
  - `docker-compose.yml` for local Postgres.

### Notes

- Business modules (Supplier, Buyer, Verification, Documents) remain unimplemented.
- See `docs/09-decisions/ADR-0001-auth-foundation.md`.

## [0.0.0] - 2026-07-21

### Added

- Repository scaffold (TRY-BNP-BOOT-01): pnpm + Turborepo + Next.js 15 + TypeScript
  monorepo, tooling, CI, and documentation portal.
