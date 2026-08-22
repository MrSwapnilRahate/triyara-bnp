import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  CostScenarioListResult,
  CostScenarioRecord,
  CostScenarioRepository,
  MutationCtx,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type {
  CreateCostScenarioDto,
  ListCostScenariosQuery,
  UpdateCostScenarioDto,
} from '@triyara/validation'

// Cost scenario service (V3, ADR-0012).
//
// Authorized on its own `CostScenario` subject, never on `Quotation`: a private
// cost exploration and a document a buyer has been sent are different things,
// and conflating their permissions would grant each through the other.
//
//   read    -> every role, via `read all`
//   create  -> ADMIN, EXPORT_MANAGER
//   update  -> ADMIN, EXPORT_MANAGER
//   delete  -> ADMIN, EXPORT_MANAGER
//   restore -> `update`, matching RFQ, Supplier, Product and Category
//
// A scenario is a working document rather than a commercial commitment, which
// is why an export manager may delete one - the single place this subject
// departs from the RFQ/Quotation rule, and it is deliberate.
//
// Nothing here computes. A scenario is a set of inputs; the engine that turns
// them into figures arrives in a later phase, and its results will be an
// append-only record of their own so recalculation never overwrites history.

export type CostScenarioCtx = AuthContext & { requestId?: string }

export interface CostScenarioServiceDeps {
  repo: CostScenarioRepository
  events: EventBus
}

function mutationCtx(ctx: CostScenarioCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

/**
 * A scenario priced in a currency other than the tenant's reporting currency
 * needs a rate, and the rate must be frozen with it.
 *
 * Refusing here rather than defaulting to 1 is the point: a silent 1.0 would
 * make a USD scenario report its total as if it were INR, and nothing
 * downstream could tell that had happened.
 */
function assertFxCoherent(currency?: string, baseCurrency?: string, fxRate?: string): void {
  if (!currency || !baseCurrency) return
  if (currency !== baseCurrency && !fxRate) {
    throw new ValidationError(
      `An exchange rate is required when the scenario currency (${currency}) differs from the base currency (${baseCurrency}).`,
    )
  }
}

export function createCostScenarioService({ repo, events }: CostScenarioServiceDeps) {
  async function emit(ctx: CostScenarioCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async list(
      ctx: CostScenarioCtx,
      query: ListCostScenariosQuery,
    ): Promise<CostScenarioListResult> {
      assertAbility(ctx, 'read', 'CostScenario')
      return repo.list({
        organizationId: ctx.organizationId,
        q: query.q,
        productId: query.productId,
        buyerId: query.buyerId,
        incoterm: query.incoterm,
        includeDeleted: query.includeDeleted === 'true',
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(
      ctx: CostScenarioCtx,
      id: string,
      opts: { includeDeleted?: boolean } = {},
    ): Promise<CostScenarioRecord> {
      assertAbility(ctx, 'read', 'CostScenario')
      const scenario = await repo.findById(ctx.organizationId, id, opts)
      if (!scenario) throw new NotFoundError('Cost scenario not found.')
      return scenario
    },

    async create(ctx: CostScenarioCtx, dto: CreateCostScenarioDto): Promise<CostScenarioRecord> {
      assertAbility(ctx, 'create', 'CostScenario')
      assertFxCoherent(dto.currency, dto.baseCurrency, dto.fxRate)

      const scenario = await repo.create(mutationCtx(ctx), {
        ...dto,
        // The repository's tenant-reference check treats null and undefined
        // alike; normalising here keeps the optional-buyer contract explicit.
        buyerId: dto.buyerId ?? null,
      })
      await emit(ctx, 'cost_scenario.created', {
        costScenarioId: scenario.id,
        productId: scenario.productId,
        incoterm: scenario.incoterm,
      })
      return scenario
    },

    async update(
      ctx: CostScenarioCtx,
      id: string,
      expectedVersion: number,
      dto: UpdateCostScenarioDto,
    ): Promise<CostScenarioRecord> {
      assertAbility(ctx, 'update', 'CostScenario')

      // Currency and rate may each arrive alone, so coherence is judged against
      // the stored record rather than the patch in isolation.
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Cost scenario not found.')
      assertFxCoherent(
        dto.currency ?? current.currency,
        dto.baseCurrency ?? current.baseCurrency,
        dto.fxRate ?? (current.fxRate === null ? undefined : String(current.fxRate)),
      )

      const scenario = await repo.update(mutationCtx(ctx), id, expectedVersion, dto)
      await emit(ctx, 'cost_scenario.updated', { costScenarioId: id })
      return scenario
    },

    async remove(
      ctx: CostScenarioCtx,
      id: string,
      expectedVersion: number,
    ): Promise<CostScenarioRecord> {
      assertAbility(ctx, 'delete', 'CostScenario')
      const scenario = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'cost_scenario.deleted', { costScenarioId: id })
      return scenario
    },

    async restore(
      ctx: CostScenarioCtx,
      id: string,
      expectedVersion: number,
    ): Promise<CostScenarioRecord> {
      // `update`, not `delete`: putting a record back is an edit, and this is
      // the same answer RFQ, Supplier, Product and Category give.
      assertAbility(ctx, 'update', 'CostScenario')
      const scenario = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'cost_scenario.restored', { costScenarioId: id })
      return scenario
    },
  }
}

export type CostScenarioService = ReturnType<typeof createCostScenarioService>
