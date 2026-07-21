---
id: ADR-0001
title: Authentication & authorization foundation
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0001: Authentication & authorization foundation

## Context

The platform needs internal-user authentication, four-role RBAC, per-request
organization isolation, and password lifecycle flows, per TRY-BNP-TDR-01
(Auth.js + CASL) and the TRY-BNP-PRD-01 role matrix. Auth is the natural place the
identity data model (User / Organization / Role) first lands.

## Decision

- **Auth.js (NextAuth v5)** with a **Credentials provider** and **JWT session
  strategy** (database sessions are unsupported with credentials). The JWT carries
  `userId`, `organizationId`, and `roles`, so guards resolve context with no DB
  round-trip.
- **CASL** ability factory maps roles → permissions; guards throw typed `AppError`s.
- **Prisma + PostgreSQL** with an **identity-only** schema now; business tables defer
  to their modules.
- **bcrypt** password hashing (cost 12); **per-email in-memory rate limiting** on login
  (Redis in production); **token-hash** password resets with expiry and no enumeration.
- Route protection via **edge middleware** (`authorized` callback); the Node instance
  holds the Credentials provider and DB access.

## Alternatives

- Clerk / WorkOS (managed): rejected for cost/control at this stage (revisit for SSO).
- Database session strategy: unavailable with the Credentials provider.
- argon2 hashing: strong, but bcryptjs avoids native-binding friction in CI.

## Trade-offs

- JWT sessions can't be revoked server-side before expiry (mitigated by the 8h window);
  a deny-list can be added later.
- In-memory rate limiting is per-instance; production needs Redis.

## Consequences

- All future modules inherit `requireAuth` / `requireAbility` and org-scoped context.
- The identity schema is live; the business schema is unblocked to build on it.

## References

- TRY-BNP-TDR-01 (stack), TRY-BNP-PRD-01 (roles), TRY-BNP-API-01 (auth model),
  TRY-BNP-DB-01 (identity entities).
