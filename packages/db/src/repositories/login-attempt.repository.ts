import type { LoginOutcome, Prisma } from '@prisma/client'

import { prisma } from '../client'
import { decodeCursor, encodeCursor } from './account.repository'

// Durable authentication-attempt log (TRY-BNP-AUTH-02). The existing in-memory
// rate limiter in @triyara/auth is per-instance and resets on restart; this
// table is the persistent record security review can actually query.
//
// Recording never throws: an audit write must not be able to break a login.

const attemptSelect = {
  id: true,
  email: true,
  userId: true,
  organizationId: true,
  outcome: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
} satisfies Prisma.LoginAttemptSelect

export type LoginAttemptRecord = Prisma.LoginAttemptGetPayload<{ select: typeof attemptSelect }>

export interface RecordLoginAttempt {
  email: string
  outcome: LoginOutcome
  userId?: string
  organizationId?: string
  ipAddress?: string
  userAgent?: string
}

export interface ListLoginAttemptsParams {
  organizationId: string
  email?: string
  userId?: string
  outcome?: LoginOutcome
  from?: Date
  to?: Date
  limit: number
  cursor?: string
}

export interface LoginAttemptListResult {
  items: LoginAttemptRecord[]
  nextCursor: string | null
}

export const loginAttemptRepository = {
  /** Best-effort: a failure to record must never block authentication. */
  async record(data: RecordLoginAttempt): Promise<void> {
    try {
      await prisma.loginAttempt.create({
        data: {
          email: data.email.toLowerCase(),
          outcome: data.outcome,
          userId: data.userId,
          organizationId: data.organizationId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      })
    } catch {
      // Intentionally swallowed - see the note at the top of this file.
    }
  },

  /** Consecutive failures for an address since a cutoff, for lockout decisions. */
  async countRecentFailures(email: string, since: Date): Promise<number> {
    return prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        outcome: { not: 'SUCCESS' },
        createdAt: { gte: since },
      },
    })
  },

  async list(params: ListLoginAttemptsParams): Promise<LoginAttemptListResult> {
    const where: Prisma.LoginAttemptWhereInput = {
      organizationId: params.organizationId,
      ...(params.email ? { email: params.email.toLowerCase() } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.outcome ? { outcome: params.outcome } : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    }

    const rows = await prisma.loginAttempt.findMany({
      where,
      select: attemptSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },
}

export type LoginAttemptRepository = typeof loginAttemptRepository
