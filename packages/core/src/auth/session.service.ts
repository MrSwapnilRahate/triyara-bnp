import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  SessionEndReason,
  SessionListResult,
  SessionRecord,
  SessionRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ForbiddenError, NotFoundError, UnauthenticatedError } from '@triyara/lib'
import type { ListSessionsQuery } from '@triyara/validation'

import { isSuperAdmin } from '../security/super-admin'

// Session registry service (TRY-BNP-AUTH-02).
//
// The frozen Auth.js config issues stateless JWTs; this service maintains the
// authoritative record of which sessions exist so they can be listed and
// revoked. Revocation is enforced by assertSessionActive, which new endpoints
// opt into - existing frozen endpoints keep their current behaviour unchanged.

export type SessionServiceCtx = AuthContext & { requestId?: string }

export interface UserLookup {
  // `email` is needed to recognise the Super Admin, for the same reason
  // user-role.service needs it: Super Admin is an address, not a role.
  findById(id: string): Promise<{ id: string; organizationId: string; email: string } | null>
}

export interface SessionServiceDeps {
  repo: SessionRepository
  users: UserLookup
  events: EventBus
}

/** Message for the one thing an ordinary administrator may not do to a session. */
export const CANNOT_END_SUPER_ADMIN_SESSION =
  'Only a super administrator may end a super administrator’s session.'

function mutationCtx(ctx: SessionServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createSessionService({ repo, users, events }: SessionServiceDeps) {
  /**
   * Whether the caller may end this person's sessions.
   *
   * `manage all` lets an administrator end anyone's session, which is right for
   * staff and wrong for the one account above them: repeatedly signing the
   * Super Admin out is the nearest an administrator can get to removing the
   * authority that approves their own role. Ending your own session is always
   * yours to do, so the check only runs when the target is somebody else.
   */
  async function assertMayEndSessionsOf(
    ctx: SessionServiceCtx,
    targetUserId: string,
  ): Promise<void> {
    if (targetUserId === ctx.user.id) return
    if (isSuperAdmin(ctx.user.email)) return
    const target = await users.findById(targetUserId)
    if (target && isSuperAdmin(target.email)) {
      throw new ForbiddenError(CANNOT_END_SUPER_ADMIN_SESSION)
    }
  }

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

    /**
     * Own sessions need no privilege; another user's are administration.
     *
     * `manage User` rather than `read User`. A session row carries an IP
     * address, a user agent and a last-seen time - where somebody was and what
     * they were using. Every role holds `read all`, so gating this on a read
     * let an exporter or a read-only account enumerate the movements of
     * everyone in the tenant, the super administrator included.
     */
    async list(ctx: SessionServiceCtx, query: ListSessionsQuery): Promise<SessionListResult> {
      const targetUserId = query.userId ?? ctx.user.id
      if (targetUserId !== ctx.user.id) assertAbility(ctx, 'manage', 'User')

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
      await assertMayEndSessionsOf(ctx, existing.userId)

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
      await assertMayEndSessionsOf(ctx, userId)

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
