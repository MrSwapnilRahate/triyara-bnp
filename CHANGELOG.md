# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/); versions follow SemVer.

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
