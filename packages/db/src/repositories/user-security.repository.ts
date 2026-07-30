import type { Prisma } from '@prisma/client'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

// Identity-lifecycle state for the FROZEN User (TRY-BNP-AUTH-02). User itself is
// never written here - all state lives in UserSecurityProfile and
// EmailVerificationToken.

const profileSelect = {
  id: true,
  userId: true,
  organizationId: true,
  emailVerifiedAt: true,
  lastPasswordChangeAt: true,
  failedLoginCount: true,
  lastFailedLoginAt: true,
  lockedUntil: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSecurityProfileSelect

export type UserSecurityProfileRecord = Prisma.UserSecurityProfileGetPayload<{
  select: typeof profileSelect
}>

export interface EmailVerificationTokenRecord {
  id: string
  userId: string
  organizationId: string
  email: string
  expiresAt: Date
  consumedAt: Date | null
  createdAt: Date
}

export const userSecurityRepository = {
  /** Returns the profile, creating an empty one on first touch. */
  async ensure(userId: string, organizationId: string): Promise<UserSecurityProfileRecord> {
    return prisma.userSecurityProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, organizationId },
      select: profileSelect,
    })
  },

  find(userId: string): Promise<UserSecurityProfileRecord | null> {
    return prisma.userSecurityProfile.findUnique({ where: { userId }, select: profileSelect })
  },

  /** Bulk lookup for list endpoints, keyed by userId. */
  async findMany(userIds: string[]): Promise<Map<string, UserSecurityProfileRecord>> {
    if (userIds.length === 0) return new Map()
    const rows = await prisma.userSecurityProfile.findMany({
      where: { userId: { in: userIds } },
      select: profileSelect,
    })
    return new Map(rows.map((r) => [r.userId, r]))
  },

  // ---- Email verification ----

  /**
   * Issues a token, superseding any outstanding one for the same address. The
   * plaintext is never stored; the caller keeps it to send by email.
   */
  async issueVerificationToken(
    ctx: MutationCtx,
    params: { userId: string; email: string; tokenHash: string; expiresAt: Date },
  ): Promise<EmailVerificationTokenRecord> {
    return prisma.$transaction(async (tx) => {
      // The partial unique index allows only one outstanding token per
      // (userId, email), so supersede rather than accumulate.
      await tx.emailVerificationToken.updateMany({
        where: { userId: params.userId, email: params.email, consumedAt: null },
        data: { consumedAt: new Date() },
      })

      const token = await tx.emailVerificationToken.create({
        data: {
          userId: params.userId,
          organizationId: ctx.organizationId,
          email: params.email,
          tokenHash: params.tokenHash,
          expiresAt: params.expiresAt,
        },
        select: {
          id: true,
          userId: true,
          organizationId: true,
          email: true,
          expiresAt: true,
          consumedAt: true,
          createdAt: true,
        },
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'EmailVerificationToken',
        entityId: token.id,
        action: 'email_verification.requested',
        after: { userId: params.userId, email: params.email },
      })

      return token
    })
  },

  findValidTokenByHash(tokenHash: string) {
    return prisma.emailVerificationToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    })
  },

  /**
   * Consumes the token and stamps the profile as verified, in one transaction so
   * a token can never be spent without the verification landing.
   */
  async consumeVerificationToken(
    ctx: MutationCtx,
    tokenId: string,
    userId: string,
  ): Promise<UserSecurityProfileRecord> {
    return prisma.$transaction(async (tx) => {
      const now = new Date()
      await tx.emailVerificationToken.update({
        where: { id: tokenId },
        data: { consumedAt: now },
      })

      const profile = await tx.userSecurityProfile.upsert({
        where: { userId },
        update: { emailVerifiedAt: now, version: { increment: 1 } },
        create: { userId, organizationId: ctx.organizationId, emailVerifiedAt: now },
        select: profileSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'UserSecurityProfile',
        entityId: profile.id,
        action: 'email_verification.confirmed',
        after: { userId, emailVerifiedAt: now },
      })

      return profile
    })
  },

  // ---- Lockout ----

  /** Increments the failure counter, locking the account once the threshold is hit. */
  async recordFailedLogin(
    userId: string,
    organizationId: string,
    opts: { threshold: number; lockForMs: number },
  ): Promise<UserSecurityProfileRecord> {
    const current = await prisma.userSecurityProfile.upsert({
      where: { userId },
      update: { failedLoginCount: { increment: 1 }, lastFailedLoginAt: new Date() },
      create: {
        userId,
        organizationId,
        failedLoginCount: 1,
        lastFailedLoginAt: new Date(),
      },
      select: profileSelect,
    })

    if (current.failedLoginCount < opts.threshold) return current

    return prisma.userSecurityProfile.update({
      where: { userId },
      data: { lockedUntil: new Date(Date.now() + opts.lockForMs) },
      select: profileSelect,
    })
  },

  /** Clears the failure counter and any lock. Called on a successful login. */
  async clearFailedLogins(userId: string, organizationId: string) {
    return prisma.userSecurityProfile.upsert({
      where: { userId },
      update: { failedLoginCount: 0, lockedUntil: null },
      create: { userId, organizationId },
      select: profileSelect,
    })
  },

  async markPasswordChanged(userId: string, organizationId: string) {
    return prisma.userSecurityProfile.upsert({
      where: { userId },
      update: {
        lastPasswordChangeAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        version: { increment: 1 },
      },
      create: { userId, organizationId, lastPasswordChangeAt: new Date() },
      select: profileSelect,
    })
  },
}

export type UserSecurityRepository = typeof userSecurityRepository
