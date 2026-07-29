---
id: ADR-0011
title: Authentication & authorization extension
status: Accepted
date: 2026-07-29
deciders: [Platform]
---

# ADR-0011: Authentication & authorization extension

## Context

The platform needs email verification, session visibility and revocation, resource-scoped
role assignment, and a durable authentication audit trail.

Most of the requested surface already exists in the **frozen** authentication foundation
(ADR-0001, `TRY-BNP-AUTH-01`): `Organization`, `User`, `Role`, `UserRole`,
`PasswordResetToken`, `AuditLog`, CASL abilities, and JWT sessions. Eighteen files import
`@triyara/auth`, and `User`/`Organization` are foreign-key targets for every other module.
Rebuilding that foundation would be a breaking change across the whole codebase.

## Decision

Build an **additive extension**. `TRY-BNP-AUTH-01` is not modified.

- **Five new tables**: `UserSecurityProfile`, `EmailVerificationToken`, `UserSession`,
  `ScopedRoleAssignment`, `LoginAttempt`. Three new enums: `RoleScopeType`,
  `SessionEndReason`, `LoginOutcome`.
- The only touch to frozen models is **column-less back-relations** on `User` and `Role` -
  the same ORM-only pattern approved for `BuyerProfile` in ADR-0007. No column is added to
  either table.
- **CASL remains the single source of truth for authorization.** There is deliberately no
  `Permission` table. `GET /auth/permissions` _derives_ the matrix from `buildAbilityFor`
  at read time, so the projection can never disagree with what the guards enforce.
- **Scoped role assignments widen WHO holds a role, never WHAT a role means.**
  `ScopedRoleAssignment` grants an existing role on one resource, optionally time-boxed.
  Effective access is computed by feeding the combined role set back into CASL.
- **`UserSecurityProfile` is a 1:1 extension of `User`**, holding the identity-lifecycle
  attributes `User` has no column for: `emailVerifiedAt`, lockout state, password age.
- **Scope targets are plain identifiers, not foreign keys.** A grant may point at a frozen
  module's row or a catalog row; a real FK would constrain modules this table must not
  touch.

## Alternatives

- **Unfreeze and rebuild auth**: rejected - breaking across 18 importing files, every
  frozen-module FK, the seed and the Auth.js configuration, for capability that can be
  added additively.
- **DB-driven permissions (`Permission` + `RolePermission`)**: rejected - it would create a
  second authorization system competing with CASL. Two sources of truth for "may this user
  do X" is the failure mode this decision exists to avoid.
- **Switch Auth.js to the `database` session strategy**: rejected - the strategy lives in
  the frozen configuration. See the trade-off below.

## Trade-offs

- **Session revocation is opt-in, not global.** Because the frozen Auth.js config issues
  stateless JWTs and cannot be changed here, a revoked session is not automatically
  rejected by every existing endpoint. `sessionService.assertActive(tokenId)` enforces it,
  and new endpoints call it. Making revocation universal requires one change to the frozen
  session callback, which is deliberately out of scope for this ADR.
- **Email verification requires an authenticated session.** The frozen middleware's
  `PUBLIC_PATHS` has no verify-email route, so the link is followed after signing in
  rather than from a signed-out state.
- **The runtime `ACTIONS`/`SUBJECTS` arrays in `permission.service.ts` mirror frozen type
  unions**, which have no runtime representation. Exhaustiveness types (`MissingAction`,
  `MissingSubject`) fail compilation if a frozen union gains a member that is not
  mirrored, so the duplication cannot drift silently.

## Consequences

- Email verification, session listing/revocation, scoped RBAC and a durable login audit
  land without touching a frozen module or an existing API contract.
- Authorization behaviour is unchanged for every existing endpoint.
- When the freeze on `TRY-BNP-AUTH-01` is eventually lifted, two follow-ups become
  available: enforcing session revocation in the JWT callback, and adding a public
  verify-email path.

## References

- ADR-0001 (auth foundation), ADR-0007 (extension via column-less back-relation).
- `docs/03-engineering/auth-extension.md`.
