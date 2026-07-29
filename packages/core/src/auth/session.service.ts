import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  SessionEndReason,
  SessionListResult,
  SessionRecord,
  SessionRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, UnauthenticatedError } from '@triyara/lib'
import type { ListSessionsQuery } from '@triyara/validation'

// Session registry service (TRY-BNP-AUTH-02).
//
// The frozen Auth.js config issues stateless JWTs; this service maintains the
// authoritative record of which sessions exist so they can be listed and
// revoked. Revocation is enforced by assertSessionActive, which new endpoints
// opt into - existing frozen endpoints keep their current behaviour unchanged.

export type SessionServiceCtx = AuthContext & { requestId?: string }

export interface SessionServiceDeps {
  repo: SessionRepository
  events: EventBus
}

function mutationCtx(ctx: SessionServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createSessionService({ repo, events }: SessionServiceDeps) {
  return {
    /** Records a session at sign-in. Idempotent on tokenId. */
    async register(params: {
      userId: string
      organizationId: string
      tokenId: string
      expiresAt: Date
      ipAddress?: string
      userAgent?: string
    }): Promise<SessionRecord> {
      return repo.record(params)
    },

    /**
     * Throws when the presented session has been revoked or has expired.
     * Endpoints that need revocation to take effect immediately call this.
     */
    async assertActive(tokenId: string): Promise<void> {
      if (!(await repo.isActive(tokenId))) {
        throw new UnauthenticatedError('This session is no longer valid.')
      }
    },

    async touch(tokenId: string): Promise<void> {
      await repo.touch(tokenId)
    },

    /** Own sessions need no privilege; another user's require read on User. */
    async list(ctx: SessionServiceCtx, query: ListSessionsQuery): Promise<SessionListResult> {
      const targetUserId = query.userId ?? ctx.user.id
      if (targetUserId !== ctx.user.id) assertAbility(ctx, 'read', 'User')

      return repo.list({
        organizationId: ctx.organizationId,
        userId: targetUserId,
        activeOnly: query.activeOnly,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async revoke(
      ctx: SessionServiceCtx,
      id: string,
      reason: SessionEndReason = 'REVOKED_BY_ADMIN',
    ): Promise<SessionRecord> {
      const existing = await repo.findById(ctx.organizationId, id)
      if (!existing) throw new NotFoundError('Session not found.')
      // Signing yourself out is always allowed; ending someone else's is not.
      if (existing.userId !== ctx.user.id) assertAbility(ctx, 'update', 'User')

      const session = await repo.revoke(mutationCtx(ctx), id, reason)
      await events.emit(
        makeEvent({
          type: 'session.revoked',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { userId: session.userId, sessionId: session.id, reason },
        }),
      )
      return session
    },

    /** Ends every live session for a user, e.g. after a password change. */
    async revokeAllForUser(
      ctx: SessionServiceCtx,
      userId: string,
      reason: SessionEndReason,
    ): Promise<{ revoked: number }> {
      if (userId !== ctx.user.id) assertAbility(ctx, 'update', 'User')

      const revoked = await repo.revokeAllForUser(mutationCtx(ctx), userId, reason)
      if (revoked > 0) {
        await events.emit(
          makeEvent({
            type: 'session.revoked_all',
            organizationId: ctx.organizationId,
            actorId: ctx.user.id,
            data: { userId, reason, count: revoked },
          }),
        )
      }
      return { revoked }
    },
  }
}

export type SessionService = ReturnType<typeof createSessionService>
