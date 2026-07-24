---
id: ADR-0010
title: Deployment Topology (Phase 1)
status: Accepted
date: 2026-07-24
deciders: [Platform]
---

# ADR-0010: Deployment Topology (Phase 1)

## Context

BNP (the Business Network Platform) needs a deployment shape for Phase 1. The question is
whether to launch as a single application or to split the frontend and backend into
separate services up front, and how it relates to the existing marketing website.

## Decision

- **BNP remains a modular monolith for Phase 1** - a single Next.js application containing
  the Frontend, API Routes, and Prisma (data access) together.
- **Separate repository** from the marketing website; the two codebases evolve
  independently.
- **Separate Vercel project** with an independent deployment lifecycle:
  - Marketing website: <https://triyaraexports.com>
  - BNP: <https://portal.triyaraexports.com>
- **Shared organization branding**, but the two deploy, release, and roll back
  independently of each other.
- **Managed PostgreSQL** is the production database.
- **Backend extraction into a dedicated service is intentionally deferred** until scale
  requires it.
- **The existing repository / service architecture is the extraction seam.** Data access
  lives behind repositories (`@triyara/db`) that are injected into services (`@triyara/core`);
  a future migration to a standalone backend should not require changing business-layer
  call sites.

## Alternatives

- **Split frontend + backend now** (two services from day one): rejected - premature for
  Phase 1 scale; adds operational overhead, cross-service latency, and deployment
  complexity without a demonstrated need.
- **Single repository shared with the marketing site**: rejected - couples two products
  with different release cadences and audiences into one deployment lifecycle.

## Trade-offs

- A monolith shares one runtime and one deploy for UI and API - simplest to operate at
  current scale, at the cost of not being able to scale the API independently yet. The
  repository/service seam keeps that option open without refactoring business logic.
- Two Vercel projects + two repositories mean branding must be kept consistent by
  convention rather than by a shared build.

## Consequences

- One codebase and one pipeline to operate for BNP in Phase 1; fast iteration.
- Independent lifecycle isolates BNP releases and incidents from the marketing site.
- When scale requires it, the backend can be extracted behind the existing repository
  interfaces without touching service call sites - the migration is additive, not a
  rewrite.

## References

- Marketing website: <https://triyaraexports.com>
- BNP: <https://portal.triyaraexports.com>
- Related: ADR-0002 (account aggregate), ADR-0009 (product catalog); the repository /
  service pattern used across all aggregates is the extraction seam referenced above.
