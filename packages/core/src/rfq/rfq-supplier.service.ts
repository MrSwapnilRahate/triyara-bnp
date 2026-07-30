import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  RfqParticipationRecord,
  RfqRepository,
  RfqSupplierRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError, ValidationError } from '@triyara/lib'
import type {
  InviteSuppliersDto,
  ListResponsesQuery,
  SubmitResponseDto,
  SupplierParticipationDto,
} from '@triyara/validation'

// Supplier participation and bidding (TRY-BNP-RFQ-01).
//
// Authorized as `Account`, matching the RFQ service - inviting suppliers and
// recording their bids are buyer-side acts on a sourcing record.

export type RfqSupplierCtx = AuthContext & { requestId?: string }

export interface RfqSupplierDeps {
  repo: RfqSupplierRepository
  rfqs: RfqRepository
  events: EventBus
}

/** Legal participation transitions. */
const PARTICIPATION: Record<string, readonly string[]> = {
  INVITED: ['VIEWED', 'ACCEPTED', 'DECLINED', 'NO_RESPONSE', 'WITHDRAWN'],
  VIEWED: ['ACCEPTED', 'DECLINED', 'NO_RESPONSE', 'WITHDRAWN'],
  ACCEPTED: ['SUBMITTED', 'DECLINED', 'NO_RESPONSE', 'WITHDRAWN'],
  DECLINED: ['ACCEPTED'],
  SUBMITTED: ['WITHDRAWN'],
  NO_RESPONSE: ['ACCEPTED'],
  WITHDRAWN: [],
}

/** An RFQ must be out with suppliers before bids can arrive. */
const OPEN_FOR_BIDS = ['ISSUED', 'IN_PROGRESS', 'EVALUATING']

function mutationCtx(ctx: RfqSupplierCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createRfqSupplierService({ repo, rfqs, events }: RfqSupplierDeps) {
  async function emit(ctx: RfqSupplierCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  // Named rather than returned inline so a method can call a sibling without
  // relying on `this`, which would break the moment a caller destructured it.
  const service = {
    async list(ctx: RfqSupplierCtx, rfqId: string): Promise<RfqParticipationRecord[]> {
      assertAbility(ctx, 'read', 'Account')
      return repo.listParticipation(ctx.organizationId, rfqId)
    },

    async invite(
      ctx: RfqSupplierCtx,
      rfqId: string,
      dto: InviteSuppliersDto,
    ): Promise<RfqParticipationRecord[]> {
      assertAbility(ctx, 'update', 'Account')

      const rfq = await rfqs.findById(ctx.organizationId, rfqId)
      if (!rfq) throw new NotFoundError('RFQ not found.')
      if (['AWARDED', 'CLOSED', 'CANCELLED', 'EXPIRED'].includes(rfq.status)) {
        throw new ConflictError(`Suppliers cannot be invited to a ${rfq.status} RFQ.`)
      }

      const participants = await repo.invite(mutationCtx(ctx), rfqId, dto.supplierIds)
      await emit(ctx, 'rfq.suppliers_invited', {
        rfqId,
        rfqNumber: rfq.rfqNumber,
        requested: dto.supplierIds.length,
        total: participants.length,
      })
      return participants
    },

    async setParticipation(
      ctx: RfqSupplierCtx,
      id: string,
      expectedVersion: number,
      dto: SupplierParticipationDto,
    ): Promise<RfqParticipationRecord> {
      assertAbility(ctx, 'update', 'Account')

      const current = await repo.findParticipation(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Supplier participation not found.')

      const allowed = PARTICIPATION[current.status] ?? []
      if (!allowed.includes(dto.status)) {
        throw new ConflictError(
          `Cannot move participation from ${current.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none'}.`,
        )
      }
      if (dto.status === 'DECLINED' && !dto.declineReason) {
        throw new ValidationError('A decline needs a reason.')
      }
      // SUBMITTED is set by submitResponse, never by hand - otherwise a
      // participation could claim a bid that does not exist.
      if (dto.status === 'SUBMITTED') {
        throw new ConflictError('Submit a response instead of setting SUBMITTED directly.')
      }

      const participation = await repo.setStatus(
        mutationCtx(ctx),
        id,
        expectedVersion,
        dto.status,
        dto.declineReason,
      )
      await emit(ctx, 'rfq.participation_changed', {
        rfqId: participation.rfqId,
        supplierId: participation.supplierId,
        status: participation.status,
      })
      return participation
    },

    /** Records a supplier's bid. Re-submitting supersedes rather than overwrites. */
    async submitResponse(ctx: RfqSupplierCtx, id: string, dto: SubmitResponseDto) {
      assertAbility(ctx, 'update', 'Account')

      const participation = await repo.findParticipation(ctx.organizationId, id)
      if (!participation) throw new NotFoundError('Supplier participation not found.')

      const rfq = await rfqs.findById(ctx.organizationId, participation.rfqId)
      if (!rfq) throw new NotFoundError('RFQ not found.')
      if (!OPEN_FOR_BIDS.includes(rfq.status)) {
        throw new ConflictError(
          `Bids are only accepted while the RFQ is ${OPEN_FOR_BIDS.join(', ')}; this one is ${rfq.status}.`,
        )
      }

      // A supplier may not quote the same line twice in one submission.
      const seen = new Set<string>()
      for (const line of dto.lines) {
        if (seen.has(line.rfqItemId)) {
          throw new ValidationError(`Line ${line.rfqItemId} is quoted more than once.`)
        }
        seen.add(line.rfqItemId)
      }

      const result = await repo.submitResponse(mutationCtx(ctx), id, {
        quotationCurrency: dto.quotationCurrency,
        quotationIncoterm: dto.quotationIncoterm as never,
        quotationPort: dto.quotationPort,
        quotationValidUntil: dto.quotationValidUntil,
        quotationRemarks: dto.quotationRemarks,
        lines: dto.lines.map((l) => ({
          rfqItemId: l.rfqItemId,
          price: l.price,
          currency: l.currency,
          moq: l.moq,
          moqUnit: l.moqUnit,
          leadTimeDays: l.leadTimeDays,
          incoterm: l.incoterm as never,
          port: l.port,
          offeredProductId: l.offeredProductId,
          offeredDescription: l.offeredDescription,
          remarks: l.remarks,
          validUntil: l.validUntil,
        })),
      })

      await emit(ctx, 'rfq.response_submitted', {
        rfqId: participation.rfqId,
        supplierId: participation.supplierId,
        lines: result.lines.length,
        isLate: result.participation.isLate,
      })
      return result
    },

    /**
     * Every bid on one RFQ. The rfqId comes from the caller's path, so a bid
     * belonging to another RFQ cannot be reached by widening the query.
     */
    async listResponsesForRfq(ctx: RfqSupplierCtx, rfqId: string, query: ListResponsesQuery) {
      assertAbility(ctx, 'read', 'Account')
      const rfq = await rfqs.findById(ctx.organizationId, rfqId)
      if (!rfq) throw new NotFoundError('RFQ not found.')
      return repo.listResponses({
        organizationId: ctx.organizationId,
        rfqId,
        rfqItemId: query.rfqItemId,
        rfqSupplierId: query.rfqSupplierId,
        currentOnly: query.currentOnly === undefined ? true : query.currentOnly === 'true',
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    /**
     * Submits a bid against an RFQ named in the path. The participation must
     * belong to that RFQ - otherwise a caller holding one RFQ's id could post a
     * bid onto another RFQ by supplying a foreign rfqSupplierId.
     */
    async submitResponseForRfq(
      ctx: RfqSupplierCtx,
      rfqId: string,
      rfqSupplierId: string,
      dto: SubmitResponseDto,
    ) {
      assertAbility(ctx, 'update', 'Account')
      const participation = await repo.findParticipation(ctx.organizationId, rfqSupplierId)
      if (!participation) throw new NotFoundError('Supplier participation not found.')
      if (participation.rfqId !== rfqId) {
        throw new NotFoundError('Supplier participation not found on this RFQ.')
      }
      return service.submitResponse(ctx, rfqSupplierId, dto)
    },

    async listResponses(ctx: RfqSupplierCtx, query: ListResponsesQuery) {
      assertAbility(ctx, 'read', 'Account')
      return repo.listResponses({
        organizationId: ctx.organizationId,
        rfqItemId: query.rfqItemId,
        rfqSupplierId: query.rfqSupplierId,
        currentOnly: query.currentOnly === undefined ? true : query.currentOnly === 'true',
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    /** Current bids for one line, cheapest first - the comparison view. */
    async compareLine(ctx: RfqSupplierCtx, rfqItemId: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.compareLine(ctx.organizationId, rfqItemId)
    },

    /** Every revision a supplier submitted for one line, newest first. */
    async priceHistory(ctx: RfqSupplierCtx, rfqSupplierId: string, rfqItemId: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.priceHistory(ctx.organizationId, rfqSupplierId, rfqItemId)
    },
  }

  return service
}

export type RfqSupplierService = ReturnType<typeof createRfqSupplierService>
