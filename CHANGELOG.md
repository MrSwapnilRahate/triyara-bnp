# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/); versions follow SemVer.

## [0.8.0-buyer-profile] - 2026-07-21

### Added

- **BuyerProfile** (TRY-BNP-BUYER-01) - a **1:1 buyer extension of Account**, mirroring the
  frozen SupplierProfile:
  - Prisma `BuyerProfile` + `BuyerProduct` + `BuyerType` / `ImportExperience` enums.
  - 1:1 via a unique `accountId` with a **Prisma relation + a column-less back-relation on
    Account** - identical to SupplierProfile. The Account **table is unchanged** (the
    back-relation adds no column); the foreign key lives on the new `BuyerProfile` table.
  - Repository: explicit selects, versioned + audited transactional mutations, product
    (products-of-interest) add/remove.
  - Service (`@triyara/core`): create / read / update / delete / restore + products;
    CASL-checked (`BuyerProfile` subject), org-isolated; emits `buyer.created / updated /
deleted / restored / capability_changed`.
  - Shared Zod DTOs; API `/accounts/:id/buyer-profile` (+ `/restore`, `/products`,
    `/products/:productId`) with the standard envelope and **ETag / If-Match / 412**.
  - UI: tabbed buyer profile (Overview / Products / Markets / Certifications / Settings)
    with create / edit / delete / restore, product management, and all states.
  - Audit row + domain event on every mutation; `buyer.*` events are **auto-ingested by
    Activity and Notifications** (their generic mappers handle the new family).
  - Tests: service unit (5) + guarded repository integration + e2e.

### Notes

- Account, SupplierProfile, Documents, Verification, Activity, Notifications and
  Authentication are unchanged.

## [0.7.0-notifications] - 2026-07-21

### Added

- **Notification Center** (TRY-BNP-NOTIFICATION-01) - a per-recipient projection built as
  a **second subscriber** of the existing event bus (beside Activity). Emits no events and
  duplicates no business logic:
  - Prisma `Notification` + `NotificationRecipient` + `NotificationDelivery` +
    `NotificationPreference` and enums (type / channel / status / priority). Entities and
    actors are referenced by plain ID - no relations to the frozen models.
  - **Subscriber ingestion**: the composition-root bus fans each event out to the Activity
    sink (unchanged) and a new Notification sink; both best-effort. No event producer or
    event name changed; no new events emitted.
  - Per-event fan-out to active org recipients, honouring **per-user, per-type
    preferences** (enable / disable / mute; default enabled, in-app). A separate
    notification mapper (title / body / priority / type) - not Activity logic.
  - **Multi-channel delivery model**: in-app is delivered immediately; email / webhook /
    push are queued (interface only) for a future dispatcher.
  - Read-state (unread / read / archived) via `readAt` / `archivedAt`, isolated per
    recipient.
  - API: `GET /notifications`, `GET /notifications/:id`, `PATCH /notifications/:id/read`,
    `PATCH /notifications/read-all`, `PATCH /notifications/:id/archive`,
    `GET /notification-preferences`, `PATCH /notification-preferences`, plus
    `GET /notifications/unread-count` for the bell.
  - UI: a global **notification bell** with unread counter (in a new app top bar) and a
    **Notification Center** - grouped by date, filters (all / unread / read / archived) +
    type + search, mark-all-read, per-item read/archive, infinite scroll, a preferences
    panel, and loading / empty / error states.
  - Tests: generation unit (preference filtering) + mapper unit + guarded repository
    integration (delivery rows, read/archive, recipient isolation, prefs) + e2e.

### Notes

- Account, SupplierProfile, Documents, Verification, Activity and Authentication are
  unchanged. Only the composition-root bus gained a second subscriber; a new read-only
  org-user lookup was added as a new db file.
- V1 policy: notifications fan out to all active org users (actor included) subject to
  their preferences - so the feature is demonstrable with a single seeded user.
- Email / webhook / push are interface-only (queued, not dispatched).
- See `docs/09-decisions/ADR-0007-notification-center.md`.

## [0.6.1-governance] - 2026-07-21

### Added

- **Repository governance** (TRY-BNP-REPO-01): `.github` CODEOWNERS, a 13-section PR
  template, issue forms, Dependabot (weekly + grouped + security), labels, and
  branch-protection / GitHub-Actions hardening docs; root `CONTRIBUTING`, `SECURITY`,
  `GOVERNANCE`, `RELEASE`, `CODE_OF_CONDUCT`; SemVer + Keep-a-Changelog + branch / merge /
  commit / review policies. No business code.

## [0.6.0-activity] - 2026-07-21

### Added

- **Activity Timeline module** (TRY-BNP-ACTIVITY-01) - an append-only feed built by
  **consuming existing domain events** (account.* / supplier.* / document.* /
  verification.*). It emits no new events and duplicates no business logic:
  - Prisma `Activity` (+ Json `metadata` = ActivityMetadata) + `ActivityType` enum;
    entities/actors referenced by plain ID only - no relations to the frozen models.
  - **Subscriber ingestion**: a composition-root event bus that preserves logging and
    attaches an Activity subscriber - the sanctioned "subscriber" mechanism of the event
    model. Wired by swapping the injected `events` dependency in the four service
    composition files; no module logic, contracts, or event names changed. Ingestion is
    best-effort (a failure is logged, never breaks the mutation).
  - Pure `mapEventToActivity` mapper: derives entity, activity type, description and
    metadata; **future event families appear automatically** (unknown prefixes map to a
    generic activity).
  - Repository: explicit selects, cursor pagination, filters (account, actor, entity,
    event, activity type, date range, search).
  - Read service (`@triyara/core`): list / get / listForAccount; org-isolated, RBAC read.
  - API: `GET /activities`, `GET /activities/:id`, `GET /accounts/:id/activities`.
  - UI: **global Activity feed** + **account timeline** - event cards with icons,
    relative time, filters, search, and infinite scroll; loading / empty / error states.
  - Tests: mapper unit (4) + guarded repository integration + an e2e that performs an
    action and sees it in the feed.

### Notes

- Account, SupplierProfile, Documents, Verification and Authentication are unchanged.
  Only `@triyara/events` (infra) gained the subscriber, and four one-line DI swaps wired
  the shared bus.
- The `DOWNLOADED` activity type is defined for completeness; no current event produces
  it (downloads emit no event, and this module must not add one).
- See `docs/09-decisions/ADR-0006-activity-timeline.md`.

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
