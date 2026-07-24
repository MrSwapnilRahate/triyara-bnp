# deployment

Index for the `07-deployment` documentation folder (see TRY-BNP-DOCS-01 for scope,
audience and update rules).

## Deployment topology (Phase 1)

Approved deployment shape for BNP. Decision of record: **ADR-0010 - Deployment Topology
(Phase 1)**.

### Shape

- **BNP is a modular monolith** for Phase 1 - a single Next.js application that contains
  the Frontend, API Routes, and Prisma (data access) in one deployable unit.
- **Managed PostgreSQL** is the production database.
- **Backend extraction into a dedicated service is deferred** until scale requires it. The
  repository (`@triyara/db`) / service (`@triyara/core`) layering is the extraction seam:
  a future split should not require changing business-layer call sites.

### Projects and domains

| Property             | Marketing website          | BNP                               |
| -------------------- | -------------------------- | --------------------------------- |
| Repository           | separate                   | separate                          |
| Vercel project       | separate                   | separate                          |
| Domain               | https://triyaraexports.com | https://portal.triyaraexports.com |
| Deployment lifecycle | independent                | independent                       |

- **Shared organization branding**, but **independent deployment lifecycle** - each
  deploys, releases, and rolls back on its own.

### Production prerequisites (BNP Vercel project)

- Managed PostgreSQL instance and `DATABASE_URL`.
- `AUTH_SECRET` (and any provider secrets) configured as project environment variables.
- Prisma migrations applied on deploy (`prisma migrate deploy`).
- Custom domain `portal.triyaraexports.com` mapped with DNS.

See `docs/09-decisions/ADR-0010-deployment-topology.md` for the full decision, alternatives,
and trade-offs.
