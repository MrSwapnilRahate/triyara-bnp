import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  AdminAccessRequestListResult,
  AdminAccessRequestRecord,
  AdminAccessRequestRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, ForbiddenError, NotFoundError } from '@triyara/lib'
import type {
  CreateAdminAccessRequestDto,
  ListAdminAccessRequestsQuery,
  RejectAdminAccessRequestDto,
  RevokeAdminAccessDto,
} from '@triyara/validation'

import { assertSuperAdmin, isSuperAdmin } from '../security/super-admin'

/**
 * Admin access requests (TRY-BNP-SUPERADMIN-01).
 *
 * ADMIN is never granted directly - both role-assignment paths refuse it - so
 * this workflow is the only route to it. That makes this service the privilege
 * boundary of the whole platform, and every refusal below is load-bearing.
 *
 * Two different gates operate here, deliberately:
 *
 *  - Submitting needs only a signed-in session. Anyone may ask.
 *  - Deciding needs the Super Admin, checked by email against centralized
 *    configuration rather than by role. An ADMIN is not sufficient: if holding
 *    ADMIN let you approve requests, the first approval would hand out the
 *    power to approve, and the restriction would last exactly one grant.
 */

export type AdminAccessRequestCtx = AuthContext & { requestId?: string }

export interface AdminAccessRequestDeps {
  repo: AdminAccessRequestRepository
  events: EventBus
}

/** What the caller needs to deliver notifications and email after a decision. */
export interface DecisionResult {
  request: AdminAccessRequestRecord
  /** The person the decision is about, for notifying them. */
  requesterUserId: string
}

function mutationCtx(ctx: AdminAccessRequestCtx) {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

function holdsAdmin(ctx: AdminAccessRequestCtx): boolean {
  return (ctx.user.roles ?? []).includes('ADMIN')
}

export function createAdminAccessRequestService({ repo, events }: AdminAccessRequestDeps) {
  return {
    /**
     * Submits a request for the signed-in user.
     *
     * The requester's details are read from the session, never from the body.
     * A client that could name the requester could ask for someone else - or
     * for an address that is not theirs.
     */
    async request(
      ctx: AdminAccessRequestCtx,
      dto: CreateAdminAccessRequestDto,
    ): Promise<AdminAccessRequestRecord> {
      if (holdsAdmin(ctx)) {
        throw new ConflictError('You already have administrator access.')
      }

      const currentRole = (ctx.user.roles ?? [])[0] ?? 'NONE'
      const request = await repo.create(mutationCtx(ctx), {
        userId: ctx.user.id,
        requesterName: ctx.user.name ?? ctx.user.email,
        requesterEmail: ctx.user.email,
        currentRole,
        reason: dto.reason,
      })

      await events.emit(
        makeEvent({
          type: 'admin_access_request.submitted',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            requestId: request.id,
            userId: ctx.user.id,
            requesterEmail: request.requesterEmail,
            currentRole,
          },
        }),
      )
      return request
    },

    /** The signed-in user's own pending request, if any. Drives the UI state. */
    async myPending(ctx: AdminAccessRequestCtx): Promise<AdminAccessRequestRecord | null> {
      return repo.findPendingForUser(ctx.user.id)
    },

    /**
     * The queue. Super Admin only - the list names who wants privileged access
     * and why, which is not something every administrator needs to read.
     */
    async list(
      ctx: AdminAccessRequestCtx,
      query: ListAdminAccessRequestsQuery,
    ): Promise<AdminAccessRequestListResult> {
      assertSuperAdmin(ctx.user.email)
      assertAbility(ctx, 'read', 'User')
      return repo.list({
        organizationId: ctx.organizationId,
        limit: query.limit,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
      })
    },

    /**
     * Approves, granting ADMIN in the same transaction.
     *
     * Approving your own request is refused even for the Super Admin. They
     * already hold the authority; the refusal exists so that the record can
     * never show someone granting themselves privilege, which is the first
     * thing anyone reviewing an incident looks for.
     */
    async approve(
      ctx: AdminAccessRequestCtx,
      id: string,
      expectedVersion: number,
    ): Promise<DecisionResult> {
      assertSuperAdmin(ctx.user.email)

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Request not found.')

      if (current.userId === ctx.user.id) {
        throw new ForbiddenError('You cannot approve your own admin access request.')
      }
      if (current.status !== 'PENDING') {
        throw new ConflictError(`This request has already been ${current.status.toLowerCase()}.`)
      }

      const request = await repo.approve(mutationCtx(ctx), id, expectedVersion)

      await events.emit(
        makeEvent({
          type: 'admin_access_request.approved',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            requestId: request.id,
            userId: request.userId,
            requesterEmail: request.requesterEmail,
          },
        }),
      )
      return { request, requesterUserId: request.userId }
    },

    /** Rejects. The reason is mandatory and is stored on the record. */
    async reject(
      ctx: AdminAccessRequestCtx,
      id: string,
      expectedVersion: number,
      dto: RejectAdminAccessRequestDto,
    ): Promise<DecisionResult> {
      assertSuperAdmin(ctx.user.email)

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Request not found.')

      if (current.userId === ctx.user.id) {
        throw new ForbiddenError('You cannot decide your own admin access request.')
      }
      if (current.status !== 'PENDING') {
        throw new ConflictError(`This request has already been ${current.status.toLowerCase()}.`)
      }

      const request = await repo.reject(mutationCtx(ctx), id, expectedVersion, dto.reason)

      await events.emit(
        makeEvent({
          type: 'admin_access_request.rejected',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            requestId: request.id,
            userId: request.userId,
            requesterEmail: request.requesterEmail,
          },
        }),
      )
      return { request, requesterUserId: request.userId }
    },

    /**
     * Withdraws access previously granted.
     *
     * Super Admin only, and no other administrator may do it - an ADMIN who
     * could revoke another ADMIN could remove everyone who disagreed with
     * them, which is the same escalation the grant path already refuses.
     *
     * Revoking your own is refused for the same reason approving your own is:
     * the record must never show someone changing their own standing.
     */
    async revoke(
      ctx: AdminAccessRequestCtx,
      id: string,
      expectedVersion: number,
      dto: RevokeAdminAccessDto,
    ): Promise<DecisionResult> {
      assertSuperAdmin(ctx.user.email)

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Request not found.')

      if (current.userId === ctx.user.id) {
        throw new ForbiddenError('You cannot revoke your own administrator access.')
      }
      if (isSuperAdmin(current.requesterEmail)) {
        // Stage-1 has one super administrator. Removing their ADMIN would
        // leave nobody able to decide any future request.
        throw new ConflictError(
          'The super administrator cannot have their administrator access revoked.',
        )
      }
      if (current.status !== 'APPROVED') {
        throw new ConflictError(
          `Only approved access can be revoked. This request is ${current.status.toLowerCase()}.`,
        )
      }

      const request = await repo.revoke(mutationCtx(ctx), id, expectedVersion, dto.reason)

      await events.emit(
        makeEvent({
          type: 'admin_access_request.revoked',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            requestId: request.id,
            userId: request.userId,
            requesterEmail: request.requesterEmail,
          },
        }),
      )
      return { request, requesterUserId: request.userId }
    },

    /**
     * The caller's own latest request, whatever its state.
     *
     * Drives what the person sees: a pending notice, a rejection, or the
     * banner telling them their access was withdrawn. Not gated - it is their
     * own record, and the repository scopes it to their user id.
     */
    async myLatest(ctx: AdminAccessRequestCtx): Promise<AdminAccessRequestRecord | null> {
      return repo.findLatestForUser(ctx.user.id)
    },

    /** Whether the signed-in caller may see the decision queue at all. */
    canDecide(ctx: AdminAccessRequestCtx): boolean {
      return isSuperAdmin(ctx.user.email)
    },
  }
}

export type AdminAccessRequestService = ReturnType<typeof createAdminAccessRequestService>
