import { assertAbility, type AuthContext } from '@triyara/auth'
import type { MutationCtx, RfqListResult, RfqRecord, RfqRepository } from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError, ValidationError } from '@triyara/lib'
import type {
  CreateRfqDto,
  ListRfqsQuery,
  ReplaceRfqItemsDto,
  RfqApprovalDto,
  UpdateRfqDto,
} from '@triyara/validation'

// RFQ service (TRY-BNP-RFQ-01).
//
// Authorization reuses the frozen CASL subjects - no new subject is introduced.
// An RFQ is a buyer-side commercial record, so it is governed as `Account`:
//   read   Account -> every role
//   create/update  -> ADMIN and EXPORT_MANAGER
//   manage         -> ADMIN only, used for approval decisions

export type RfqServiceCtx = AuthContext & { requestId?: string }

export interface RfqServiceDeps {
  repo: RfqRepository
  events: EventBus
}

/**
 * Legal sourcing transitions. Anything not listed is rejected, so the workflow
 * cannot be walked into an inconsistent state by a malformed request.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['ISSUED', 'CANCELLED'],
  ISSUED: ['IN_PROGRESS', 'EXPIRED', 'CANCELLED'],
  IN_PROGRESS: ['EVALUATING', 'EXPIRED', 'CANCELLED'],
  EVALUATING: ['AWARDED', 'CLOSED', 'CANCELLED'],
  AWARDED: ['CLOSED'],
  EXPIRED: ['CLOSED', 'DRAFT'],
  CLOSED: [],
  CANCELLED: ['DRAFT'],
}

/** Approval decision -> the sourcing status it drives. */
const DECISION_TARGET: Record<string, string> = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'DRAFT',
  CANCELLED: 'CANCELLED',
}

function mutationCtx(ctx: RfqServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createRfqService({ repo, events }: RfqServiceDeps) {
  async function emit(ctx: RfqServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  /** A BUYER rfq needs an external buyer; an INTERNAL one must not carry one. */
  function assertBuyerMatchesType(type: string | undefined, buyerId: string | undefined) {
    if (type === 'BUYER' && !buyerId) {
      throw new ValidationError('A buyer RFQ requires buyerId.')
    }
    if (type === 'INTERNAL' && buyerId) {
      throw new ValidationError('An internal RFQ must not carry a buyer.')
    }
  }

  /** Each line is a catalog product or a free-text request, never neither. */
  function assertItemsWellFormed(
    items: ReadonlyArray<{ productId?: string; customProductName?: string }>,
  ) {
    items.forEach((it, i) => {
      if (!it.productId && !it.customProductName) {
        throw new ValidationError(`Line ${i + 1} needs either productId or customProductName.`)
      }
    })
  }

  return {
    async list(ctx: RfqServiceCtx, query: ListRfqsQuery): Promise<RfqListResult> {
      assertAbility(ctx, 'read', 'Account')
      return repo.list({
        organizationId: ctx.organizationId,
        q: query.q,
        type: query.type,
        status: query.status,
        priority: query.priority,
        buyerId: query.buyerId,
        supplierId: query.supplierId,
        productId: query.productId,
        destinationCountry: query.destinationCountry,
        destinationPort: query.destinationPort,
        deadlineBefore: query.deadlineBefore,
        deadlineAfter: query.deadlineAfter,
        includeDeleted: query.includeDeleted === 'true',
        sort: query.sort,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(ctx: RfqServiceCtx, id: string): Promise<RfqRecord> {
      assertAbility(ctx, 'read', 'Account')
      const rfq = await repo.findById(ctx.organizationId, id)
      if (!rfq) throw new NotFoundError('RFQ not found.')
      return rfq
    },

    async create(
      ctx: RfqServiceCtx,
      dto: CreateRfqDto,
      items: ReplaceRfqItemsDto['items'],
    ): Promise<RfqRecord> {
      assertAbility(ctx, 'create', 'Account')
      assertBuyerMatchesType(dto.type, dto.buyerId)
      assertItemsWellFormed(items)

      if (dto.quotationDeadline && dto.expectedShipmentDate) {
        if (dto.quotationDeadline > dto.expectedShipmentDate) {
          throw new ValidationError('quotationDeadline must not be after expectedShipmentDate.')
        }
      }

      const existing = await repo.findByNumber(ctx.organizationId, dto.rfqNumber)
      if (existing) {
        throw new ConflictError(
          existing.deletedAt
            ? `RFQ number "${dto.rfqNumber}" belongs to a deleted RFQ. Restore it instead.`
            : `An RFQ numbered "${dto.rfqNumber}" already exists.`,
        )
      }

      const rfq = await repo.create(
        mutationCtx(ctx),
        {
          rfqNumber: dto.rfqNumber,
          type: dto.type,
          buyerId: dto.type === 'BUYER' ? dto.buyerId : null,
          title: dto.title,
          description: dto.description,
          currency: dto.currency,
          incoterm: dto.incoterm,
          destinationCountry: dto.destinationCountry,
          destinationPort: dto.destinationPort,
          expectedShipmentDate: dto.expectedShipmentDate,
          quotationDeadline: dto.quotationDeadline,
          priority: dto.priority,
        },
        items.map((it) => ({
          productId: it.productId ?? null,
          customProductName: it.customProductName ?? null,
          customProductDescription: it.customProductDescription,
          quantity: it.quantity,
          unit: it.unit,
          targetPrice: it.targetPrice,
          targetCurrency: it.targetCurrency,
          specifications: it.specifications as never,
          requiredCertifications: it.requiredCertifications as never,
          packaging: it.packaging,
          remarks: it.remarks,
        })),
      )

      await emit(ctx, 'rfq.created', {
        rfqId: rfq.id,
        rfqNumber: rfq.rfqNumber,
        type: rfq.type,
        items: items.length,
      })
      return rfq
    },

    async update(
      ctx: RfqServiceCtx,
      id: string,
      expectedVersion: number,
      dto: UpdateRfqDto,
    ): Promise<RfqRecord> {
      assertAbility(ctx, 'update', 'Account')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('RFQ not found.')

      // An issued RFQ is out with suppliers; its commercial terms are frozen.
      const FROZEN_AFTER_ISSUE = ['ISSUED', 'IN_PROGRESS', 'EVALUATING', 'AWARDED', 'CLOSED']
      if (FROZEN_AFTER_ISSUE.includes(current.status)) {
        const touchesTerms =
          dto.currency !== undefined ||
          dto.incoterm !== undefined ||
          dto.quotationDeadline !== undefined ||
          dto.destinationPort !== undefined
        if (touchesTerms) {
          throw new ConflictError(
            `Commercial terms cannot change once the RFQ is ${current.status}. Raise a revision instead.`,
          )
        }
      }

      assertBuyerMatchesType(dto.type ?? current.type, dto.buyerId ?? current.buyerId ?? undefined)

      const rfq = await repo.mutate(mutationCtx(ctx), id, expectedVersion, dto)
      await emit(ctx, 'rfq.updated', { rfqId: rfq.id, rfqNumber: rfq.rfqNumber })
      return rfq
    },

    /** Replaces the line items and cuts a new revision. */
    async reviseItems(
      ctx: RfqServiceCtx,
      id: string,
      expectedVersion: number,
      dto: ReplaceRfqItemsDto,
      reason?: string,
    ): Promise<RfqRecord> {
      assertAbility(ctx, 'update', 'Account')
      assertItemsWellFormed(dto.items)

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('RFQ not found.')
      if (['AWARDED', 'CLOSED', 'CANCELLED'].includes(current.status)) {
        throw new ConflictError(`Lines cannot be revised on a ${current.status} RFQ.`)
      }

      const rfq = await repo.replaceItems(
        mutationCtx(ctx),
        id,
        expectedVersion,
        dto.items.map((it) => ({
          productId: it.productId ?? null,
          customProductName: it.customProductName ?? null,
          customProductDescription: it.customProductDescription,
          quantity: it.quantity,
          unit: it.unit,
          targetPrice: it.targetPrice,
          targetCurrency: it.targetCurrency,
          specifications: it.specifications as never,
          requiredCertifications: it.requiredCertifications as never,
          packaging: it.packaging,
          remarks: it.remarks,
        })),
        reason,
      )

      await emit(ctx, 'rfq.items_revised', {
        rfqId: rfq.id,
        revision: rfq.currentRevision,
        items: dto.items.length,
      })
      return rfq
    },

    /**
     * Approval decision. Restricted to `manage Account`, which resolves to ADMIN
     * only - raising an RFQ and approving one are deliberately different rights.
     */
    async decide(
      ctx: RfqServiceCtx,
      id: string,
      expectedVersion: number,
      dto: RfqApprovalDto,
    ): Promise<RfqRecord> {
      assertAbility(ctx, 'manage', 'Account')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('RFQ not found.')

      const target = DECISION_TARGET[dto.decision]
      if (!target) throw new ValidationError(`Unsupported decision: ${dto.decision}`)

      const allowed = TRANSITIONS[current.status] ?? []
      if (!allowed.includes(target)) {
        throw new ConflictError(
          `Cannot move a ${current.status} RFQ to ${target}. Allowed: ${allowed.join(', ') || 'none'}.`,
        )
      }

      // An RFQ cannot be approved with no lines to quote against.
      if (target === 'APPROVED' && current.items.length === 0) {
        throw new ConflictError('An RFQ needs at least one line before approval.')
      }

      const rfq = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        target as never,
        dto.decision,
        dto.comments,
      )
      await emit(ctx, `rfq.${dto.decision.toLowerCase()}`, {
        rfqId: rfq.id,
        fromStatus: current.status,
        toStatus: rfq.status,
      })
      return rfq
    },

    /** Moves an approved RFQ out to its invited suppliers. */
    async issue(ctx: RfqServiceCtx, id: string, expectedVersion: number): Promise<RfqRecord> {
      assertAbility(ctx, 'update', 'Account')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('RFQ not found.')
      if (current.status !== 'APPROVED') {
        throw new ConflictError(
          `Only an APPROVED RFQ can be issued; this one is ${current.status}.`,
        )
      }
      if (current.suppliers.length === 0) {
        throw new ConflictError('Invite at least one supplier before issuing.')
      }

      const rfq = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        'ISSUED' as never,
        'APPROVED' as never,
        'Issued to invited suppliers.',
      )
      await emit(ctx, 'rfq.issued', {
        rfqId: rfq.id,
        rfqNumber: rfq.rfqNumber,
        suppliers: current.suppliers.length,
      })
      return rfq
    },

    /**
     * Closes a sourcing round. Separate from `decide` because no approval
     * decision maps to CLOSED - DECISION_TARGET stops at CANCELLED, so a
     * finished round could otherwise never be retired. The legal predecessors
     * come from the same TRANSITIONS table, not a second copy of the rules.
     */
    async close(ctx: RfqServiceCtx, id: string, expectedVersion: number): Promise<RfqRecord> {
      assertAbility(ctx, 'update', 'Account')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('RFQ not found.')

      const allowed = TRANSITIONS[current.status] ?? []
      if (!allowed.includes('CLOSED')) {
        throw new ConflictError(
          `A ${current.status} RFQ cannot be closed. Allowed from here: ${allowed.join(', ') || 'none'}.`,
        )
      }

      // RFQApprovalStatus has no CLOSED member, so the approval row records
      // APPROVED: the closure was sanctioned. CANCELLED would misrepresent a
      // round that concluded normally. No cast - the compiler checks the member.
      const rfq = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        'CLOSED',
        'APPROVED',
        'Sourcing round closed.',
      )
      await emit(ctx, 'rfq.closed', {
        rfqId: rfq.id,
        rfqNumber: rfq.rfqNumber,
        fromStatus: current.status,
      })
      return rfq
    },

    /**
     * Returns a cancelled or expired RFQ to DRAFT so it can be re-run. Requires
     * `manage Account`: reviving a round that was deliberately stopped is an
     * administrative act, not routine editing.
     */
    async reopen(ctx: RfqServiceCtx, id: string, expectedVersion: number): Promise<RfqRecord> {
      assertAbility(ctx, 'manage', 'Account')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('RFQ not found.')

      const allowed = TRANSITIONS[current.status] ?? []
      if (!allowed.includes('DRAFT')) {
        throw new ConflictError(
          `A ${current.status} RFQ cannot be reopened. Allowed from here: ${allowed.join(', ') || 'none'}.`,
        )
      }

      const rfq = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        'DRAFT',
        'DRAFT',
        'Reopened for a further sourcing round.',
      )
      await emit(ctx, 'rfq.reopened', {
        rfqId: rfq.id,
        rfqNumber: rfq.rfqNumber,
        fromStatus: current.status,
      })
      return rfq
    },

    async approvalHistory(ctx: RfqServiceCtx, id: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.approvalHistory(ctx.organizationId, id)
    },

    async revisionHistory(ctx: RfqServiceCtx, id: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.revisionHistory(ctx.organizationId, id)
    },

    async remove(ctx: RfqServiceCtx, id: string, expectedVersion: number): Promise<RfqRecord> {
      assertAbility(ctx, 'delete', 'Account')
      const rfq = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'rfq.deleted', { rfqId: rfq.id, rfqNumber: rfq.rfqNumber })
      return rfq
    },

    async restore(ctx: RfqServiceCtx, id: string, expectedVersion: number): Promise<RfqRecord> {
      assertAbility(ctx, 'update', 'Account')
      const rfq = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'rfq.restored', { rfqId: rfq.id })
      return rfq
    },
  }
}

export type RfqService = ReturnType<typeof createRfqService>
