import { Prisma } from '@prisma/client'
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

// Freight rate persistence (V3.3, ADR-0012).
//
// ORGANIZATION-SCOPED, unlike the Port and ContainerType it references. A
// negotiated rate is a commercial term belonging to one tenant; the corridor it
// runs along is a fact about the world. Every query below carries
// organizationId for that reason.
//
// Five database constraints back this table up - see migration 0020. They are
// not decoration: V3.4 will select a rate automatically, so two live rates
// covering the same corridor on the same day would make a cost ambiguous.

const detailSelect = {
  id: true,
  organizationId: true,
  originPortId: true,
  destinationPortId: true,
  mode: true,
  containerTypeId: true,
  amount: true,
  currency: true,
  source: true,
  notes: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdById: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  originPort: { select: { id: true, locode: true, name: true, countryCode: true } },
  destinationPort: { select: { id: true, locode: true, name: true, countryCode: true } },
  containerType: { select: { id: true, code: true, name: true, teu: true } },
} satisfies Prisma.FreightRateSelect

export type FreightRateRecord = Prisma.FreightRateGetPayload<{ select: typeof detailSelect }>

/** Money and rates arrive as decimal STRINGS - never JS numbers. */
export interface CreateFreightRateData {
  originPortId: string
  destinationPortId: string
  mode: Prisma.FreightRateCreateInput['mode']
  containerTypeId?: string | null
  amount: string
  currency: string
  source?: string | null
  notes?: string | null
  effectiveFrom: Date
  effectiveTo?: Date | null
}

export type UpdateFreightRateData = Partial<CreateFreightRateData>

export interface ListFreightRatesParams {
  organizationId: string
  originPortId?: string | undefined
  destinationPortId?: string | undefined
  mode?: Prisma.FreightRateWhereInput['mode']
  containerTypeId?: string | undefined
  /** Rates live on this instant. Used by V3.4 selection and by the UI filter. */
  effectiveOn?: Date | undefined
  includeDeleted?: boolean
  limit: number
  cursor?: string | undefined
}

export interface FreightRateListResult {
  items: FreightRateRecord[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Turns the database's own refusals into the platform's error vocabulary.
 *
 * The constraints are the source of truth - the service validates the same
 * rules first so the user gets a clear message, but a concurrent writer can
 * still race past that check and only the database can catch it. Losing that
 * distinction would turn a 409 into a 500.
 */
function mapConstraint(error: unknown): never {
  const message =
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
      ? String(error.message)
      : ''

  if (message.includes('FreightRate_no_overlapping_validity')) {
    throw new ConflictError(
      'Another rate already covers this corridor for part of that period. Close or adjust it first.',
    )
  }
  if (message.includes('FreightRate_distinct_ports')) {
    throw new ValidationError('Origin and destination must be different ports.')
  }
  if (message.includes('FreightRate_container_matches_mode')) {
    throw new ValidationError(
      'Container type is required for SEA_FCL and must be omitted for non-containerised modes.',
    )
  }
  if (message.includes('FreightRate_effective_order')) {
    throw new ValidationError('The end of the validity period must be after its start.')
  }
  if (message.includes('FreightRate_amount_non_negative')) {
    throw new ValidationError('A freight rate cannot be negative.')
  }
  throw error
}

/** Both referenced ports and the container type must exist and be active. */
async function assertReferences(
  tx: Prisma.TransactionClient,
  data: { originPortId?: string; destinationPortId?: string; containerTypeId?: string | null },
): Promise<void> {
  const portIds = [data.originPortId, data.destinationPortId].filter(
    (id): id is string => typeof id === 'string',
  )
  if (portIds.length > 0) {
    const found = await tx.port.findMany({
      where: { id: { in: portIds }, isActive: true },
      select: { id: true },
    })
    if (found.length !== new Set(portIds).size) {
      throw new NotFoundError('Port not found, or no longer active.')
    }
  }
  if (data.containerTypeId) {
    const container = await tx.containerType.findFirst({
      where: { id: data.containerTypeId, isActive: true },
      select: { id: true },
    })
    if (!container) throw new NotFoundError('Container type not found, or no longer active.')
  }
}

export const freightRateRepository = {
  async create(ctx: MutationCtx, data: CreateFreightRateData): Promise<FreightRateRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertReferences(tx, data)
        const created = await tx.freightRate.create({
          data: { ...data, organizationId: ctx.organizationId, createdById: ctx.actorId },
          select: detailSelect,
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'FreightRate',
          entityId: created.id,
          action: 'freight_rate.created',
          after: {
            mode: created.mode,
            amount: String(created.amount),
            currency: created.currency,
          },
        })
        return created
      })
    } catch (error) {
      return mapConstraint(error)
    }
  },

  async findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<FreightRateRecord | null> {
    return prisma.freightRate.findFirst({
      where: { id, organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  async list(params: ListFreightRatesParams): Promise<FreightRateListResult> {
    const where: Prisma.FreightRateWhereInput = {
      organizationId: params.organizationId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.originPortId ? { originPortId: params.originPortId } : {}),
      ...(params.destinationPortId ? { destinationPortId: params.destinationPortId } : {}),
      ...(params.mode ? { mode: params.mode } : {}),
      ...(params.containerTypeId ? { containerTypeId: params.containerTypeId } : {}),
      // A rate is live on a date when it started by then and has not ended.
      ...(params.effectiveOn
        ? {
            effectiveFrom: { lte: params.effectiveOn },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: params.effectiveOn } }],
          }
        : {}),
    }

    const rows = await prisma.freightRate.findMany({
      where,
      select: detailSelect,
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    })

    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore }
  },

  async update(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateFreightRateData,
  ): Promise<FreightRateRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const before = await tx.freightRate.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: detailSelect,
        })
        if (!before) throw new NotFoundError('Freight rate not found.')

        await assertReferences(tx, data)

        const updated = await tx.freightRate.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...data, version: { increment: 1 } },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        const after = await tx.freightRate.findUniqueOrThrow({
          where: { id },
          select: detailSelect,
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'FreightRate',
          entityId: id,
          action: 'freight_rate.updated',
          before: { amount: String(before.amount), currency: before.currency },
          after: { amount: String(after.amount), currency: after.currency },
        })
        return after
      })
    } catch (error) {
      return mapConstraint(error)
    }
  },

  async softDelete(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
  ): Promise<FreightRateRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.freightRate.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Freight rate not found.')

      const updated = await tx.freightRate.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.freightRate.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'FreightRate',
        entityId: id,
        action: 'freight_rate.deleted',
        before: { deletedAt: before.deletedAt },
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },

  async restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<FreightRateRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const before = await tx.freightRate.findFirst({
          where: { id, organizationId: ctx.organizationId, NOT: { deletedAt: null } },
          select: detailSelect,
        })
        if (!before) throw new NotFoundError('Deleted freight rate not found.')

        const updated = await tx.freightRate.updateMany({
          where: { id, organizationId: ctx.organizationId, version: expectedVersion },
          data: { deletedAt: null, version: { increment: 1 } },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        const after = await tx.freightRate.findUniqueOrThrow({
          where: { id },
          select: detailSelect,
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'FreightRate',
          entityId: id,
          action: 'freight_rate.restored',
          before: { deletedAt: before.deletedAt },
          after: { deletedAt: after.deletedAt },
        })
        return after
      })
    } catch (error) {
      // Restoring can resurrect a period another live rate has since taken.
      return mapConstraint(error)
    }
  },
}

export type FreightRateRepository = typeof freightRateRepository
