---
id: TRY-BNP-AUTH-02
title: Authentication & Authorization Extension
status: Approved
version: v1.0
---

# TRY-BNP-AUTH-02 - Authentication & Authorization Extension

Additive layer over the frozen authentication foundation (`TRY-BNP-AUTH-01`). Decision of
record: **ADR-0011**.

## What already exists (frozen, unchanged)

`Organization`, `User`, `Role`, `UserRole`, `PasswordResetToken`, `AuditLog`, CASL
abilities in `@triyara/auth`, Auth.js credentials + JWT sessions, and the in-memory login
rate limiter. None of it is modified by this module.

## What this module adds

| Table                    | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `UserSecurityProfile`    | 1:1 extension of `User`: `emailVerifiedAt`, lockout state, password age. |
| `EmailVerificationToken` | Single-use token; only the SHA-256 hash is stored.                       |
| `UserSession`            | Registry of issued sessions, for listing, audit and revocation.          |
| `ScopedRoleAssignment`   | Grants an existing role on one resource, optionally time-boxed.          |
| `LoginAttempt`           | Durable authentication audit trail.                                      |

Enums: `RoleScopeType`, `SessionEndReason`, `LoginOutcome`.

## Authorization model

**CASL stays authoritative.** Nothing here stores a permission rule.

- A scoped grant changes **who holds a role** on a resource. It never changes **what the
  role permits** - that is decided by `buildAbilityFor` in `@triyara/auth`.
- `GET /auth/permissions` derives the matrix at read time; there is no stored copy that
  could drift from the guards.
- Privilege mapping under the frozen ability model:
  - `read User` -> every role (all roles have `read all`) - viewing sessions/assignments.
  - `update User` -> **ADMIN only** (only ADMIN has `manage all`) - granting/revoking roles,
    acting on another user.
  - `manage Organization` -> **ADMIN only** - reading the login-attempt audit.
  - Acting on your **own** session or verification needs no elevated privilege.

## API

All under `/api/v1/auth`, using the standard envelope and cursor pagination.

| Method   | Path                          | Notes                                                            |
| -------- | ----------------------------- | ---------------------------------------------------------------- |
| `GET`    | `/email-verification`         | Verification status (self, or any with read).                    |
| `POST`   | `/email-verification`         | Issue a token. `202`. Token is **not** returned.                 |
| `POST`   | `/email-verification/confirm` | Consume a token.                                                 |
| `GET`    | `/sessions`                   | Own sessions; another user's needs `read User`.                  |
| `DELETE` | `/sessions/:id`               | Revoke. Own session always allowed.                              |
| `GET`    | `/permissions`                | Effective matrix; `?scopeType=&scopeId=` includes scoped grants. |
| `GET`    | `/role-assignments`           | List scoped grants.                                              |
| `POST`   | `/role-assignments`           | Grant a role on a resource. **ADMIN**. `201`.                    |
| `DELETE` | `/role-assignments/:id`       | Revoke a grant. **ADMIN**.                                       |
| `GET`    | `/login-attempts`             | Authentication audit. **ADMIN**.                                 |

The plaintext verification token is never placed in a response body; it is logged, exactly
as the existing password-reset flow does, until an email transport lands.

## Constraints enforced in the database

Created by `20260729060900_auth_extension_constraints` (Prisma cannot express them):

1. **One active grant per user/role/scope** - partial unique index `WHERE revokedAt IS NULL`,
   so a revoked grant can legitimately be re-issued later.
2. **One outstanding verification token per user/address** - re-requesting supersedes
   rather than leaving several usable tokens.
3. **Live-session partial index** - "who is signed in now" stays proportional to active
   sessions.

## Known limitations

- **Revocation is opt-in.** The frozen Auth.js config is JWT-based, so a revoked session is
  rejected only by endpoints that call `sessionService.assertActive`. Universal enforcement
  needs one change to the frozen session callback.
- **Verification requires being signed in**, because the frozen middleware has no public
  verify-email path.

Both are recorded as follow-ups in ADR-0011.
