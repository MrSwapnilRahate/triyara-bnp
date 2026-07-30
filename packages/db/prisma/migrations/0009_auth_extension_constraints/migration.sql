-- Auth extension invariants Prisma cannot express (TRY-BNP-AUTH-02).

-- A user may hold a given role on a given scope only once at a time. Revoked
-- grants are excluded so the same grant can legitimately be re-issued later,
-- which a plain @@unique would block forever.
CREATE UNIQUE INDEX "ScopedRoleAssignment_unique_active_grant"
  ON "ScopedRoleAssignment" ("userId", "roleId", "scopeType", "scopeId")
  WHERE "revokedAt" IS NULL;

-- Only one verification token may be outstanding per user/address at a time,
-- so re-requesting supersedes rather than accumulating usable tokens.
CREATE UNIQUE INDEX "EmailVerificationToken_one_outstanding"
  ON "EmailVerificationToken" ("userId", "email")
  WHERE "consumedAt" IS NULL;

-- Live-session lookups ("who is signed in right now") stay proportional to
-- active sessions rather than to every session ever issued.
CREATE INDEX "UserSession_active_idx"
  ON "UserSession" ("organizationId", "userId", "expiresAt")
  WHERE "endedAt" IS NULL;
