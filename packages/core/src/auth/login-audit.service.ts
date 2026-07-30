import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  LoginAttemptListResult,
  LoginAttemptRepository,
  LoginOutcome,
  UserSecurityRepository,
} from '@triyara/db'
import type { ListLoginAttemptsQuery } from '@triyara/validation'

// Login audit + lockout policy (TRY-BNP-AUTH-02).
//
// The frozen credentials provider keeps its in-memory rate limiter; this service
// adds the durable record and the account-lockout decision on top. Recording is
// best-effort by design - see loginAttemptRepository.record.

export type LoginAuditCtx = AuthContext & { requestId?: string }

export interface LockoutPolicy {
  /** Consecutive failures before the account locks. */
  threshold: number
  /** How long the lock lasts. */
  lockForMs: number
}

export const DEFAULT_LOCKOUT: LockoutPolicy = {
  threshold: 5,
  lockForMs: 15 * 60 * 1000,
}

export interface LoginAuditDeps {
  attempts: LoginAttemptRepository
  security: UserSecurityRepository
  policy?: LockoutPolicy
}

export function createLoginAuditService({
  attempts,
  security,
  policy = DEFAULT_LOCKOUT,
}: LoginAuditDeps) {
  return {
    /** True when the account is currently locked out. */
    async isLockedOut(userId: string): Promise<boolean> {
      const profile = await security.find(userId)
      if (!profile?.lockedUntil) return false
      return profile.lockedUntil.getTime() > Date.now()
    },

    /** Records a failure and applies the lockout policy. */
    async recordFailure(params: {
      email: string
      outcome: Exclude<LoginOutcome, 'SUCCESS'>
      userId?: string
      organizationId?: string
      ipAddress?: string
      userAgent?: string
    }): Promise<{ locked: boolean }> {
      await attempts.record(params)

      if (!params.userId || !params.organizationId) return { locked: false }

      const profile = await security.recordFailedLogin(params.userId, params.organizationId, policy)
      return { locked: profile.lockedUntil !== null && profile.lockedUntil.getTime() > Date.now() }
    },

    /** Records a success and clears any accumulated failures. */
    async recordSuccess(params: {
      email: string
      userId: string
      organizationId: string
      ipAddress?: string
      userAgent?: string
    }): Promise<void> {
      await attempts.record({ ...params, outcome: 'SUCCESS' })
      await security.clearFailedLogins(params.userId, params.organizationId)
    },

    /**
     * Security review of authentication attempts. Restricted to administrators:
     * `manage Organization` resolves to ADMIN only under the frozen ability
     * model, so a READ_ONLY user cannot enumerate login activity.
     */
    async list(ctx: LoginAuditCtx, query: ListLoginAttemptsQuery): Promise<LoginAttemptListResult> {
      assertAbility(ctx, 'manage', 'Organization')
      return attempts.list({
        organizationId: ctx.organizationId,
        email: query.email,
        userId: query.userId,
        outcome: query.outcome,
        from: query.from,
        to: query.to,
        limit: query.limit,
        cursor: query.cursor,
      })
    },
  }
}

export type LoginAuditService = ReturnType<typeof createLoginAuditService>
