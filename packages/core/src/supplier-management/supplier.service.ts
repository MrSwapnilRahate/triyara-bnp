import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  SupplierListResult,
  SupplierRecord,
  SupplierRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError, ValidationError } from '@triyara/lib'
import type {
  CreateSupplierDto,
  ListSuppliersQuery,
  SearchSuppliersQuery,
  SupplierApprovalDto,
  SupplierFacetQuery,
  UpdateSupplierDto,
} from '@triyara/validation'

// Supplier master service (TRY-BNP-SUPPLIER-02).
//
// Named SupplierMaster* because the FROZEN supplier module already exports
// createSupplierService / SupplierService for SupplierProfile. Renaming the
// frozen exports is not an option, so the new module takes the distinct name -
// the same resolution the schema used for SupplierProduct.
//
// Authorization uses the frozen `SupplierProfile` CASL subject, so no new
// subject is introduced:
//   read   SupplierProfile -> every role
//   create/update          -> ADMIN and EXPORT_MANAGER
//   manage                 -> ADMIN only, used for approval decisions

export type SupplierMasterCtx = AuthContext & { requestId?: string }

export interface SupplierMasterDeps {
  repo: SupplierRepository
  events: EventBus
}

/**
 * Legal onboarding transitions. Anything not listed is rejected, so the
 * workflow cannot be walked into an inconsistent state by a malformed request.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['PENDING_REVIEW', 'INACTIVE'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['BLOCKED', 'INACTIVE'],
  REJECTED: ['DRAFT', 'PENDING_REVIEW'],
  BLOCKED: ['APPROVED', 'INACTIVE'],
  INACTIVE: ['DRAFT'],
}

const DECISION_TARGET: Record<string, string> = {
  SUBMITTED: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
  UNBLOCKED: 'APPROVED',
  REOPENED: 'DRAFT',
}

function mutationCtx(ctx: SupplierMasterCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createSupplierMasterService({ repo, events }: SupplierMasterDeps) {
  async function emit(ctx: SupplierMasterCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async list(ctx: SupplierMasterCtx, query: ListSuppliersQuery): Promise<SupplierListResult> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.list({
        organizationId: ctx.organizationId,
        q: query.q,
        status: query.status,
        businessType: query.businessType,
        country: query.country,
        city: query.city,
        isVerified: query.isVerified === undefined ? undefined : query.isVerified === 'true',
        productId: query.productId,
        tagId: query.tagId,
        gstNumber: query.gstNumber,
        iecNumber: query.iecNumber,
        panNumber: query.panNumber,
        includeDeleted: query.includeDeleted === 'true',
        sort: query.sort,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(ctx: SupplierMasterCtx, id: string): Promise<SupplierRecord> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      const supplier = await repo.findById(ctx.organizationId, id)
      if (!supplier) throw new NotFoundError('Supplier not found.')
      return supplier
    },

    async create(ctx: SupplierMasterCtx, dto: CreateSupplierDto): Promise<SupplierRecord> {
      assertAbility(ctx, 'create', 'SupplierProfile')

      const existing = await repo.findByCode(ctx.organizationId, dto.supplierCode)
      if (existing) {
        throw new ConflictError(
          existing.deletedAt
            ? `Supplier code "${dto.supplierCode}" belongs to a deleted supplier. Restore it instead.`
            : `A supplier with code "${dto.supplierCode}" already exists.`,
        )
      }

      const supplier = await repo.create(mutationCtx(ctx), dto)
      await emit(ctx, 'supplier.created', {
        supplierId: supplier.id,
        supplierCode: supplier.supplierCode,
      })
      return supplier
    },

    async update(
      ctx: SupplierMasterCtx,
      id: string,
      expectedVersion: number,
      dto: UpdateSupplierDto,
    ): Promise<SupplierRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const supplier = await repo.mutate(mutationCtx(ctx), id, expectedVersion, dto)
      await emit(ctx, 'supplier.updated', { supplierId: supplier.id })
      return supplier
    },

    /**
     * Approval decision. Restricted to `manage SupplierProfile`, which resolves
     * to ADMIN only - onboarding a supplier and approving one are deliberately
     * different privileges.
     */
    async decide(
      ctx: SupplierMasterCtx,
      id: string,
      expectedVersion: number,
      dto: SupplierApprovalDto,
    ): Promise<SupplierRecord> {
      assertAbility(ctx, 'manage', 'SupplierProfile')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Supplier not found.')

      const target = DECISION_TARGET[dto.decision]
      if (!target) throw new ValidationError(`Unsupported decision: ${dto.decision}`)

      const allowed = TRANSITIONS[current.status] ?? []
      if (!allowed.includes(target)) {
        throw new ConflictError(
          `Cannot move a ${current.status} supplier to ${target}. Allowed: ${allowed.join(', ') || 'none'}.`,
        )
      }

      const supplier = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        target as never,
        dto.decision,
        dto.comments,
      )
      await emit(ctx, `supplier.${dto.decision.toLowerCase()}`, {
        supplierId: supplier.id,
        fromStatus: current.status,
        toStatus: supplier.status,
      })
      return supplier
    },

    async history(ctx: SupplierMasterCtx, id: string) {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.approvalHistory(ctx.organizationId, id)
    },

    async remove(
      ctx: SupplierMasterCtx,
      id: string,
      expectedVersion: number,
    ): Promise<SupplierRecord> {
      assertAbility(ctx, 'delete', 'SupplierProfile')
      const supplier = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'supplier.deleted', { supplierId: supplier.id })
      return supplier
    },

    async restore(
      ctx: SupplierMasterCtx,
      id: string,
      expectedVersion: number,
    ): Promise<SupplierRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const supplier = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'supplier.restored', { supplierId: supplier.id })
      return supplier
    },

    /** Compliance sweep: certifications lapsing within `days`. */
    async expiringCertifications(ctx: SupplierMasterCtx, days = 30) {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.expiringCertifications(ctx.organizationId, days)
    },

    /**
     * Typeahead search. Reuses the list query rather than adding a second search
     * path, so a supplier findable in the list is findable here and the two can
     * never disagree. The projection is trimmed because a picker needs a label
     * and an id, not a full record.
     */
    async search(
      ctx: SupplierMasterCtx,
      query: SearchSuppliersQuery,
    ): Promise<SupplierSearchHit[]> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      const result = await repo.list({
        organizationId: ctx.organizationId,
        q: query.q,
        status: query.status,
        productId: query.productId,
        country: query.country,
        includeDeleted: false,
        sort: 'companyName',
        limit: query.limit,
      })
      // An exact supplier-code match is what the user meant; surface it first.
      const needle = query.q.toLowerCase()
      return result.items
        .map((s) => ({
          id: s.id,
          supplierCode: s.supplierCode,
          companyName: s.companyName,
          country: s.country,
          city: s.city,
          status: s.status,
          isVerified: s.isVerified,
        }))
        .sort((a, b) => {
          const rank = (h: SupplierSearchHit) =>
            h.supplierCode.toLowerCase() === needle
              ? 0
              : h.companyName.toLowerCase() === needle
                ? 1
                : 2
          return rank(a) - rank(b) || a.companyName.localeCompare(b.companyName)
        })
    },

    /** Filter vocabulary: countries this tenant actually sources from. */
    async countries(ctx: SupplierMasterCtx, query: SupplierFacetQuery = {}) {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.countryFacets(ctx.organizationId, {
        includeDeleted: query.includeDeleted === 'true',
      })
    },

    /** Filter vocabulary: certification types held, with how many are current. */
    async certifications(ctx: SupplierMasterCtx) {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.certificationFacets(ctx.organizationId)
    },
  }
}

/** Compact projection for the picker; never carries banking or contact data. */
export interface SupplierSearchHit {
  id: string
  supplierCode: string
  companyName: string
  country: string | null
  city: string | null
  status: string
  isVerified: boolean
}

export type SupplierMasterService = ReturnType<typeof createSupplierMasterService>
