import type { Prisma } from '@prisma/client'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'
import { assertBuyerInOrg, assertProductsInOrg } from './tenant-refs'

// Cost scenario persistence (V3, ADR-0012).
//
// Conventions are the catalogue's, deliberately: tenant-scoped `where`, soft
// delete, optimistic concurrency on `version`, audit inside the transaction.
// Nothing here computes anything - a scenario is a set of inputs, and the
// engine that turns them into figures arrives in a later phase.

const chargeSelect = {
  id: true,
  type: true,
  basis: true,
  label: true,
  rate: true,
  amount: true,
  currency: true,
  isDeduction: true,
  sequence: true,
  notes: true,
  version: true,
} satisfies Prisma.CostScenarioChargeSelect

const detailSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  productId: true,
  quantity: true,
  unit: true,
  buyerId: true,
  incoterm: true,
  originLocode: true,
  destinationLocode: true,
  destinationCountry: true,
  originPortId: true,
  destinationPortId: true,
  containerTypeId: true,
  ratesEffectiveOn: true,
  mode: true,
  grossWeightKg: true,
  volumeCbm: true,
  containerCount: true,
  unitCost: true,
  currency: true,
  baseCurrency: true,
  fxRate: true,
  fxRateDate: true,
  sellingPricePerUnit: true,
  createdById: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  originPort: { select: { id: true, locode: true, name: true, countryCode: true, modes: true } },
  destinationPort: {
    select: { id: true, locode: true, name: true, countryCode: true, modes: true },
  },
  containerType: { select: { id: true, code: true, name: true, teu: true } },
  charges: {
    where: { deletedAt: null },
    orderBy: { sequence: 'asc' },
    select: chargeSelect,
  },
} satisfies Prisma.CostScenarioSelect

const listSelect = {
  id: true,
  name: true,
  productId: true,
  buyerId: true,
  incoterm: true,
  mode: true,
  quantity: true,
  unit: true,
  currency: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.CostScenarioSelect

export type CostScenarioRecord = Prisma.CostScenarioGetPayload<{ select: typeof detailSelect }>
export type CostScenarioListItem = Prisma.CostScenarioGetPayload<{ select: typeof listSelect }>

/**
 * Money and quantities arrive as decimal STRINGS, never as JS numbers.
 *
 * A `number` here would already have lost precision before Prisma saw it - see
 * @triyara/money. Prisma accepts a string for a Decimal column and stores it
 * exactly, so the string is carried end to end.
 */
export interface CostScenarioChargeInput {
  type: Prisma.CostScenarioChargeCreateManyScenarioInput['type']
  basis?: Prisma.CostScenarioChargeCreateManyScenarioInput['basis']
  label?: string | null
  rate?: string | null
  amount: string
  currency: string
  isDeduction?: boolean
  sequence?: number
  notes?: string | null
}

export interface CreateCostScenarioData {
  name: string
  description?: string | null
  productId: string
  quantity: string
  unit: string
  buyerId?: string | null
  incoterm: Prisma.CostScenarioCreateInput['incoterm']
  originLocode?: string | null
  destinationLocode?: string | null
  originPortId?: string | null
  destinationPortId?: string | null
  containerTypeId?: string | null
  ratesEffectiveOn?: Date | null
  destinationCountry?: string | null
  mode?: Prisma.CostScenarioCreateInput['mode']
  grossWeightKg?: string | null
  volumeCbm?: string | null
  containerCount?: number | null
  unitCost: string
  currency: string
  baseCurrency: string
  fxRate?: string | null
  fxRateDate?: Date | null
  sellingPricePerUnit?: string | null
  charges?: CostScenarioChargeInput[]
}

export type UpdateCostScenarioData = Partial<Omit<CreateCostScenarioData, 'charges'>> & {
  /** Present replaces the whole set; absent leaves the existing charges alone. */
  charges?: CostScenarioChargeInput[]
}

export interface ListCostScenariosParams {
  organizationId: string
  q?: string | undefined
  productId?: string | undefined
  buyerId?: string | undefined
  incoterm?: Prisma.CostScenarioWhereInput['incoterm']
  includeDeleted?: boolean
  limit: number
  cursor?: string | undefined
}

export interface CostScenarioListResult {
  items: CostScenarioListItem[]
  nextCursor: string | null
  hasMore: boolean
}

function chargeRows(organizationId: string, charges: CostScenarioChargeInput[]) {
  return charges.map((c, index) => ({
    organizationId,
    type: c.type,
    basis: c.basis ?? 'FIXED_AMOUNT',
    label: c.label ?? null,
    rate: c.rate ?? null,
    amount: c.amount,
    currency: c.currency,
    isDeduction: c.isDeduction ?? false,
    // Sequence is significant - charges resolve as ordered conditions - so an
    // omitted one falls back to the caller's array order rather than to 0,
    // which would make every such charge tie.
    sequence: c.sequence ?? index,
    notes: c.notes ?? null,
  }))
}

/** Both foreign keys are checked inside the caller's transaction, in one place. */
async function assertReferences(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productId: string | undefined,
  buyerId: string | null | undefined,
): Promise<void> {
  if (productId) await assertProductsInOrg(tx, organizationId, [productId])
  await assertBuyerInOrg(tx, organizationId, buyerId)
}

export const costScenarioRepository = {
  async create(ctx: MutationCtx, data: CreateCostScenarioData): Promise<CostScenarioRecord> {
    return prisma.$transaction(async (tx) => {
      await assertReferences(tx, ctx.organizationId, data.productId, data.buyerId)

      const { charges = [], ...scalars } = data
      const created = await tx.costScenario.create({
        data: {
          ...scalars,
          organizationId: ctx.organizationId,
          createdById: ctx.actorId,
          charges: { createMany: { data: chargeRows(ctx.organizationId, charges) } },
        },
        select: detailSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'CostScenario',
        entityId: created.id,
        action: 'cost_scenario.created',
        after: { name: created.name, productId: created.productId, incoterm: created.incoterm },
      })
      return created
    })
  },

  async findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<CostScenarioRecord | null> {
    return prisma.costScenario.findFirst({
      where: { id, organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  async list(params: ListCostScenariosParams): Promise<CostScenarioListResult> {
    const where: Prisma.CostScenarioWhereInput = {
      organizationId: params.organizationId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.productId ? { productId: params.productId } : {}),
      ...(params.buyerId ? { buyerId: params.buyerId } : {}),
      ...(params.incoterm ? { incoterm: params.incoterm } : {}),
      ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
    }

    const rows = await prisma.costScenario.findMany({
      where,
      select: listSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    data: UpdateCostScenarioData,
  ): Promise<CostScenarioRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.costScenario.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Cost scenario not found.')

      await assertReferences(tx, ctx.organizationId, data.productId, data.buyerId)

      const { charges, ...scalars } = data
      const updated = await tx.costScenario.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { ...scalars, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      if (charges) {
        await tx.costScenarioCharge.deleteMany({ where: { scenarioId: id } })
        const rows = chargeRows(ctx.organizationId, charges)
        if (rows.length > 0) {
          await tx.costScenarioCharge.createMany({
            data: rows.map((r) => ({ ...r, scenarioId: id })),
          })
        }
      }

      const after = await tx.costScenario.findUniqueOrThrow({
        where: { id },
        select: detailSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'CostScenario',
        entityId: id,
        action: 'cost_scenario.updated',
        before: { name: before.name, incoterm: before.incoterm, unitCost: String(before.unitCost) },
        after: { name: after.name, incoterm: after.incoterm, unitCost: String(after.unitCost) },
      })
      return after
    })
  },

  async softDelete(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
  ): Promise<CostScenarioRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.costScenario.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Cost scenario not found.')

      const updated = await tx.costScenario.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.costScenario.findUniqueOrThrow({
        where: { id },
        select: detailSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'CostScenario',
        entityId: id,
        action: 'cost_scenario.deleted',
        before: { name: before.name, deletedAt: before.deletedAt },
        after: { name: after.name, deletedAt: after.deletedAt },
      })
      return after
    })
  },

  async restore(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
  ): Promise<CostScenarioRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.costScenario.findFirst({
        where: { id, organizationId: ctx.organizationId, NOT: { deletedAt: null } },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Deleted cost scenario not found.')

      const updated = await tx.costScenario.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { deletedAt: null, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.costScenario.findUniqueOrThrow({
        where: { id },
        select: detailSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'CostScenario',
        entityId: id,
        action: 'cost_scenario.restored',
        before: { deletedAt: before.deletedAt },
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },
}

export type CostScenarioRepository = typeof costScenarioRepository
