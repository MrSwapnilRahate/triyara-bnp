import type { Prisma, SessionEndReason } from '@prisma/client'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Session registry (TRY-BNP-AUTH-02). The frozen Auth.js configuration stays
// JWT-based; this table records each issued session so it can be listed,
// audited and revoked. See ADR-0011 for how revocation is enforced.

const sessionSelect = {
  id: true,
  userId: true,
  organizationId: true,
  tokenId: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  lastSeenAt: true,
  expiresAt: true,
  endedAt: true,
  endReason: true,
} satisfies Prisma.UserSessionSelect

export type SessionRecord = Prisma.UserSessionGetPayload<{ select: typeof sessionSelect }>

export interface ListSessionsParams {
  organizationId: string
  userId?: string
  activeOnly?: boolean
  limit: number
  cursor?: string
}

export interface SessionListResult {
  items: SessionRecord[]
  nextCursor: string | null
}

export const sessionRepository = {
  async record(params: {
    userId: string
    organizationId: string
    tokenId: string
    expiresAt: Date
    ipAddress?: string
    userAgent?: string
  }): Promise<SessionRecord> {
    return prisma.userSession.upsert({
      where: { tokenId: params.tokenId },
      update: { lastSeenAt: new Date() },
      create: {
        userId: params.userId,
        organizationId: params.organizationId,
        tokenId: params.tokenId,
        expiresAt: params.expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
      select: sessionSelect,
    })
  },

  findByTokenId(tokenId: string): Promise<SessionRecord | null> {
    return prisma.userSession.findUnique({ where: { tokenId }, select: sessionSelect })
  },

  findById(organizationId: string, id: string): Promise<SessionRecord | null> {
    return prisma.userSession.findFirst({ where: { id, organizationId }, select: sessionSelect })
  },

  /** True when the session exists, has not ended and has not expired. */
  async isActive(tokenId: string): Promise<boolean> {
    const row = await prisma.userSession.findFirst({
      where: { tokenId, endedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    })
    return row !== null
  },

  async touch(tokenId: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { tokenId, endedAt: null },
      data: { lastSeenAt: new Date() },
    })
  },

  async list(params: ListSessionsParams): Promise<SessionListResult> {
    const where: Prisma.UserSessionWhereInput = {
      organizationId: params.organizationId,
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.activeOnly ? { endedAt: null, expiresAt: { gt: new Date() } } : {}),
    }

    const rows = await prisma.userSession.findMany({
      where,
      select: sessionSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /** Ends one session. Already-ended sessions are left untouched (idempotent). */
  async revoke(ctx: MutationCtx, id: string, reason: SessionEndReason): Promise<SessionRecord> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.userSession.update({
        where: { id },
        data: { endedAt: new Date(), endReason: reason },
        select: sessionSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'UserSession',
        entityId: session.id,
        action: 'session.revoked',
        after: { userId: session.userId, reason },
      })

      return session
    })
  },

  /**
   * Ends every live session for a user. Used on password change and
   * deactivation. Returns the number of sessions ended.
   */
  async revokeAllForUser(
    ctx: MutationCtx,
    userId: string,
    reason: SessionEndReason,
  ): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.userSession.updateMany({
        where: { userId, organizationId: ctx.organizationId, endedAt: null },
        data: { endedAt: new Date(), endReason: reason },
      })

      if (result.count > 0) {
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'UserSession',
          entityId: userId,
          action: 'session.revoked_all',
          after: { userId, reason, count: result.count },
        })
      }

      return result.count
    })
  },
}

export type SessionRepository = typeof sessionRepository
