import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  ContainerTypeRecord,
  FreightRateListResult,
  FreightRateRecord,
  FreightRateRepository,
  LogisticsReferenceRepository,
  MutationCtx,
  PortRecord,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type {
  CreateFreightRateDto,
  ListContainerTypesQuery,
  ListFreightRatesQuery,
  ListPortsQuery,
  UpdateFreightRateDto,
} from '@triyara/validation'

// Freight and logistics services (V3.3, ADR-0012).
//
// Two authorization stories in one file, deliberately, because the distinction
// is the point:
//
//   Port, ContainerType  -> `read ReferenceData`. Global facts. Every role
//                           reads them; only an administrator curates them, and
//                           in V3.3 curation happens through the seed.
//   FreightRate          -> its own `FreightRate` subject. A negotiated rate is
//                           this tenant's commercial term, so ADMIN manages and
//                           EXPORT_MANAGER - the person who negotiates it -
//                           creates, updates and deletes. Restore rides on
//                           `update`, matching every other V2 aggregate.

export type LogisticsCtx = AuthContext & { requestId?: string }

function mutationCtx(ctx: LogisticsCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

const CONTAINERISED = new Set(['SEA_FCL'])
const NON_CONTAINERISED = new Set(['SEA_LCL', 'AIR', 'ROAD', 'RAIL'])

/**
 * The mode/container rule, judged against the record as it will END UP.
 *
 * Validation already refuses an incoherent payload, but a PATCH may change only
 * the mode and leave a container behind - so the merged state is what matters,
 * not the patch alone. The database CHECK is the final backstop.
 */
function assertModeCoherent(mode?: string, containerTypeId?: string | null): void {
  if (!mode) return
  if (CONTAINERISED.has(mode) && !containerTypeId) {
    throw new ValidationError(`A container type is required for ${mode}.`)
  }
  if (NON_CONTAINERISED.has(mode) && containerTypeId) {
    throw new ValidationError(`${mode} does not carry a container type.`)
  }
}

/**
 * A port must actually serve the mode being quoted against it.
 *
 * MULTIMODAL is exempt, and deliberately: it spans legs the port serves
 * individually, so demanding that a seaport declare MULTIMODAL would refuse
 * exactly the corridors the mode exists to describe.
 */
async function assertPortsServeMode(
  repo: LogisticsReferenceRepository,
  mode: string | undefined,
  portIds: Array<string | undefined>,
): Promise<void> {
  if (!mode || mode === 'MULTIMODAL') return
  const ids = portIds.filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return
  const ports = await repo.listPorts({ includeInactive: true })
  for (const id of ids) {
    const port = ports.find((p) => p.id === id)
    if (port && !port.modes.includes(mode as never)) {
      throw new ValidationError(`${port.locode} (${port.name}) does not serve ${mode}.`)
    }
  }
}

export interface LogisticsReferenceServiceDeps {
  repo: LogisticsReferenceRepository
}

export function createLogisticsReferenceService({ repo }: LogisticsReferenceServiceDeps) {
  return {
    async listPorts(ctx: LogisticsCtx, query: ListPortsQuery): Promise<PortRecord[]> {
      // Global data, so there is no organizationId to scope by - and passing
      // one would be the first step towards ports becoming tenant data.
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.listPorts({
        q: query.q,
        countryCode: query.countryCode,
        mode: query.mode,
        includeInactive: query.includeInactive === 'true',
      })
    },

    async listContainerTypes(
      ctx: LogisticsCtx,
      query: ListContainerTypesQuery,
    ): Promise<ContainerTypeRecord[]> {
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.listContainerTypes({ includeInactive: query.includeInactive === 'true' })
    },
  }
}

export type LogisticsReferenceService = ReturnType<typeof createLogisticsReferenceService>

export interface FreightRateServiceDeps {
  repo: FreightRateRepository
  reference: LogisticsReferenceRepository
  events: EventBus
}

export function createFreightRateService({ repo, reference, events }: FreightRateServiceDeps) {
  async function emit(ctx: LogisticsCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async list(ctx: LogisticsCtx, query: ListFreightRatesQuery): Promise<FreightRateListResult> {
      assertAbility(ctx, 'read', 'FreightRate')
      return repo.list({
        organizationId: ctx.organizationId,
        originPortId: query.originPortId,
        destinationPortId: query.destinationPortId,
        mode: query.mode,
        containerTypeId: query.containerTypeId,
        effectiveOn: query.effectiveOn,
        includeDeleted: query.includeDeleted === 'true',
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(
      ctx: LogisticsCtx,
      id: string,
      opts: { includeDeleted?: boolean } = {},
    ): Promise<FreightRateRecord> {
      assertAbility(ctx, 'read', 'FreightRate')
      const rate = await repo.findById(ctx.organizationId, id, opts)
      if (!rate) throw new NotFoundError('Freight rate not found.')
      return rate
    },

    async create(ctx: LogisticsCtx, dto: CreateFreightRateDto): Promise<FreightRateRecord> {
      assertAbility(ctx, 'create', 'FreightRate')
      assertModeCoherent(dto.mode, dto.containerTypeId)
      await assertPortsServeMode(reference, dto.mode, [dto.originPortId, dto.destinationPortId])

      const rate = await repo.create(mutationCtx(ctx), {
        ...dto,
        containerTypeId: dto.containerTypeId ?? null,
        effectiveTo: dto.effectiveTo ?? null,
      })
      await emit(ctx, 'freight_rate.created', { freightRateId: rate.id, mode: rate.mode })
      return rate
    },

    async update(
      ctx: LogisticsCtx,
      id: string,
      expectedVersion: number,
      dto: UpdateFreightRateDto,
    ): Promise<FreightRateRecord> {
      assertAbility(ctx, 'update', 'FreightRate')

      // Merge before judging: a patch that changes only the mode still has to
      // be coherent with the container the stored row already carries.
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Freight rate not found.')
      const mode = dto.mode ?? current.mode
      const containerTypeId =
        dto.containerTypeId === undefined ? current.containerTypeId : dto.containerTypeId
      assertModeCoherent(mode, containerTypeId)
      await assertPortsServeMode(reference, mode, [
        dto.originPortId ?? current.originPortId,
        dto.destinationPortId ?? current.destinationPortId,
      ])

      const rate = await repo.update(mutationCtx(ctx), id, expectedVersion, dto)
      await emit(ctx, 'freight_rate.updated', { freightRateId: id })
      return rate
    },

    async remove(
      ctx: LogisticsCtx,
      id: string,
      expectedVersion: number,
    ): Promise<FreightRateRecord> {
      assertAbility(ctx, 'delete', 'FreightRate')
      const rate = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'freight_rate.deleted', { freightRateId: id })
      return rate
    },

    async restore(
      ctx: LogisticsCtx,
      id: string,
      expectedVersion: number,
    ): Promise<FreightRateRecord> {
      // `update`, not `delete` - putting a record back is an edit.
      assertAbility(ctx, 'update', 'FreightRate')
      const rate = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'freight_rate.restored', { freightRateId: id })
      return rate
    },
  }
}

export type FreightRateService = ReturnType<typeof createFreightRateService>
