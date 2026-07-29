import { createHash, randomBytes } from 'node:crypto'

import { assertAbility, type AuthContext } from '@triyara/auth'
import type { MutationCtx, UserSecurityProfileRecord, UserSecurityRepository } from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ForbiddenError, NotFoundError, ValidationError } from '@triyara/lib'
import type { ConfirmEmailVerificationDto, RequestEmailVerificationDto } from '@triyara/validation'

// Email verification (TRY-BNP-AUTH-02). Token generation mirrors the existing
// password-reset flow: 32 random bytes, only the SHA-256 hash is persisted.

export type EmailVerificationCtx = AuthContext & { requestId?: string }

export interface UserLookup {
  findById(id: string): Promise<{ id: string; email: string; organizationId: string } | null>
}

export interface EmailVerificationDeps {
  repo: UserSecurityRepository
  users: UserLookup
  events: EventBus
  /** Token lifetime. Defaults to 24 hours. */
  ttlMs?: number
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function mutationCtx(ctx: EmailVerificationCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createEmailVerificationService({
  repo,
  users,
  events,
  ttlMs = DEFAULT_TTL_MS,
}: EmailVerificationDeps) {
  return {
    /** Current verification state for a user. Self, or any user for a reader. */
    async status(ctx: EmailVerificationCtx, userId?: string): Promise<UserSecurityProfileRecord> {
      const target = userId ?? ctx.user.id
      if (target !== ctx.user.id) assertAbility(ctx, 'read', 'User')
      return repo.ensure(target, ctx.organizationId)
    },

    /**
     * Issues a verification token. Returns the plaintext exactly once so the
     * caller can deliver it; it is never retrievable afterwards.
     */
    async request(
      ctx: EmailVerificationCtx,
      dto: RequestEmailVerificationDto,
      opts: { userId?: string } = {},
    ): Promise<{ email: string; token: string; expiresAt: Date }> {
      const targetId = opts.userId ?? ctx.user.id
      // Requesting verification for someone else is an administrative act.
      if (targetId !== ctx.user.id) assertAbility(ctx, 'update', 'User')

      const user = await users.findById(targetId)
      if (!user) throw new NotFoundError('User not found.')
      if (user.organizationId !== ctx.organizationId) {
        throw new NotFoundError('User not found.')
      }

      const email = dto.email ?? user.email
      const profile = await repo.ensure(targetId, ctx.organizationId)
      if (profile.emailVerifiedAt && email === user.email) {
        throw new ValidationError('This address is already verified.')
      }

      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + ttlMs)
      await repo.issueVerificationToken(mutationCtx(ctx), {
        userId: targetId,
        email,
        tokenHash: hashToken(token),
        expiresAt,
      })

      await events.emit(
        makeEvent({
          type: 'user.email_verification_requested',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { userId: targetId, email },
        }),
      )

      return { email, token, expiresAt }
    },

    /**
     * Consumes a token and marks the address verified.
     *
     * Possession of the token is the proof, but the caller must still be the
     * token's owner (or an administrator). The frozen middleware has no public
     * verify route, so this is always reached from an authenticated session -
     * see ADR-0011.
     */
    async confirm(
      ctx: EmailVerificationCtx,
      dto: ConfirmEmailVerificationDto,
    ): Promise<UserSecurityProfileRecord> {
      const record = await repo.findValidTokenByHash(hashToken(dto.token))
      if (!record) throw new NotFoundError('This verification link is invalid or has expired.')

      if (record.userId !== ctx.user.id) {
        // Not the owner: only an administrator may complete it on their behalf.
        if (!ctx.ability.can('update', 'User')) {
          throw new ForbiddenError('This verification link belongs to another user.')
        }
      }
      if (record.organizationId !== ctx.organizationId) {
        throw new NotFoundError('This verification link is invalid or has expired.')
      }

      const profile = await repo.consumeVerificationToken(
        mutationCtx(ctx),
        record.id,
        record.userId,
      )

      await events.emit(
        makeEvent({
          type: 'user.email_verified',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { userId: record.userId, email: record.email },
        }),
      )

      return profile
    },
  }
}

export type EmailVerificationService = ReturnType<typeof createEmailVerificationService>
