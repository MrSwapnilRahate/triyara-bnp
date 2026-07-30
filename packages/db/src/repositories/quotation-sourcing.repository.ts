import { Prisma } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

// Sourcing options, charges and taxes (TRY-BNP-QUOTE-01).
//
// QuotationSourceOption delivers three capabilities from one model: price
// comparison (order by landedUnitCost), supplier comparison (options per line)
// and winner selection (isSelected, with a partial unique index guaranteeing
// exactly one winner per line).
//
// Supplier terms are DENORMALISED onto the option row at evaluation time, so the
// comparison stays reproducible even if the underlying bid is later revised.

const optionSelect = {
  id: true,
  quotationItemId: true,
  organizationId: true,
  supplierId: true,
  rfqSupplierResponseId: true,
  supplierPrice: true,
  supplierCurrency: true,
  fxRate: true,
  landedUnitCost: true,
  moq: true,
  leadTimeDays: true,
  incoterm: true,
  port: true,
  rank: true,
  isSelected: true,
  selectionReason: true,
  selectedById: true,
  selectedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  supplier: { select: { id: true, supplierCode: true, companyName: true, status: true } },
} satisfies Prisma.QuotationSourceOptionSelect

const chargeSelect = {
  id: true,
  quotationId: true,
  quotationItemId: true,
  organizationId: true,
  type: true,
  scope: true,
  basis: true,
  label: true,
  rate: true,
  amount: true,
  currency: true,
  isDeduction: true,
  sequence: true,
  isVisibleToCustomer: true,
  notes: true,
  version: true,
  deletedAt: true,
} satisfies Prisma.QuotationChargeSelect

const taxSelect = {
  id: true,
  quotationId: true,
  quotationItemId: true,
  organizationId: true,
  type: true,
  code: true,
  jurisdiction: true,
  ratePercent: true,
  taxableAmount: true,
  amount: true,
  currency: true,
  isCompound: true,
  isReverseCharge: true,
  sequence: true,
  version: true,
  deletedAt: true,
} satisfies Prisma.QuotationTaxSelect

export type SourceOptionRecord = Prisma.QuotationSourceOptionGetPayload<{
  select: typeof optionSelect
}>
export type QuotationChargeRecord = Prisma.QuotationChargeGetPayload<{
  select: typeof chargeSelect
}>
export type QuotationTaxRecord = Prisma.QuotationTaxGetPayload<{ select: typeof taxSelect }>

export interface SourceOptionData {
  supplierId: string
  rfqSupplierResponseId?: string
  supplierPrice: number
  supplierCurrency: string
  fxRate?: number
  landedUnitCost: number
  moq?: number
  leadTimeDays?: number
  incoterm?: Prisma.QuotationSourceOptionCreateManyInput['incoterm']
  port?: string
}

export interface ChargeData {
  quotationItemId?: string | null
  type: Prisma.QuotationChargeCreateManyInput['type']
  scope?: Prisma.QuotationChargeCreateManyInput['scope']
  basis?: Prisma.QuotationChargeCreateManyInput['basis']
  label?: string
  rate?: number
  amount: number
  currency: string
  isDeduction?: boolean
  sequence?: number
  isVisibleToCustomer?: boolean
  notes?: string
}

export interface TaxData {
  quotationItemId?: string | null
  type: Prisma.QuotationTaxCreateManyInput['type']
  code?: string
  jurisdiction?: string
  ratePercent: number
  taxableAmount: number
  amount: number
  currency: string
  isCompound?: boolean
  isReverseCharge?: boolean
  sequence?: number
}

export const quotationSourcingRepository = {
  /**
   * Replaces the candidate options for one line and re-ranks them by landed
   * cost. Rank 1 is the cheapest; selection is a separate, explicit act.
   */
  async replaceOptions(
    ctx: MutationCtx,
    quotationItemId: string,
    options: SourceOptionData[],
  ): Promise<SourceOptionRecord[]> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.quotationItem.findFirst({
        where: { id: quotationItemId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, quotationId: true },
      })
      if (!item) throw new NotFoundError('Quotation line not found.')

      const supplierIds = [...new Set(options.map((o) => o.supplierId))]
      const known = await tx.supplier.findMany({
        where: { id: { in: supplierIds }, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      const knownIds = new Set(known.map((s) => s.id))
      const missing = supplierIds.filter((id) => !knownIds.has(id))
      if (missing.length > 0) throw new NotFoundError(`Supplier not found: ${missing.join(', ')}`)

      await tx.quotationSourceOption.deleteMany({ where: { quotationItemId } })

      // Rank by landed cost - the only figure comparable across suppliers.
      const ranked = [...options].sort((a, b) => a.landedUnitCost - b.landedUnitCost)
      await tx.quotationSourceOption.createMany({
        data: ranked.map((o, i) => ({
          quotationItemId,
          organizationId: ctx.organizationId,
          supplierId: o.supplierId,
          rfqSupplierResponseId: o.rfqSupplierResponseId,
          supplierPrice: o.supplierPrice,
          supplierCurrency: o.supplierCurrency,
          fxRate: o.fxRate,
          landedUnitCost: o.landedUnitCost,
          moq: o.moq,
          leadTimeDays: o.leadTimeDays,
          incoterm: o.incoterm,
          port: o.port,
          rank: i + 1,
        })),
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'QuotationItem',
        entityId: quotationItemId,
        action: 'quotation.options_evaluated',
        after: { options: options.length, best: ranked[0]?.landedUnitCost ?? null },
      })

      return tx.quotationSourceOption.findMany({
        where: { quotationItemId, deletedAt: null },
        orderBy: { landedUnitCost: 'asc' },
        select: optionSelect,
      })
    })
  },

  /** Candidate options for one line, cheapest landed cost first. */
  compareLine(organizationId: string, quotationItemId: string): Promise<SourceOptionRecord[]> {
    return prisma.quotationSourceOption.findMany({
      where: { organizationId, quotationItemId, deletedAt: null },
      orderBy: [{ landedUnitCost: 'asc' }, { id: 'asc' }],
      select: optionSelect,
    })
  },

  findOption(organizationId: string, id: string): Promise<SourceOptionRecord | null> {
    return prisma.quotationSourceOption.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: optionSelect,
    })
  },

  /**
   * Awards one line to one supplier. Any prior winner on the same line is
   * cleared first, so the partial unique index can never be violated.
   */
  async selectOption(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    reason?: string,
  ): Promise<SourceOptionRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const option = await tx.quotationSourceOption.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true, quotationItemId: true, supplierId: true },
        })
        if (!option) throw new NotFoundError('Sourcing option not found.')

        await tx.quotationSourceOption.updateMany({
          where: { quotationItemId: option.quotationItemId, isSelected: true, NOT: { id } },
          data: { isSelected: false, selectionReason: null, selectedById: null, selectedAt: null },
        })

        const updated = await tx.quotationSourceOption.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: {
            isSelected: true,
            selectionReason: reason,
            selectedById: ctx.actorId,
            selectedAt: new Date(),
            version: { increment: 1 },
          },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        const after = await tx.quotationSourceOption.findUniqueOrThrow({
          where: { id },
          select: optionSelect,
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'QuotationSourceOption',
          entityId: id,
          action: 'quotation.supplier_selected',
          after: {
            quotationItemId: option.quotationItemId,
            supplierId: option.supplierId,
            landedUnitCost: after.landedUnitCost,
            reason: reason ?? null,
          },
        })
        return after
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Another supplier is already selected for this line.')
      }
      throw error
    }
  },

  // ---- Pricing conditions ----

  /**
   * Replaces charges and taxes wholesale. Two statements per collection
   * regardless of how many conditions there are.
   */
  async replaceConditions(
    ctx: MutationCtx,
    quotationId: string,
    charges: ChargeData[],
    taxes: TaxData[],
  ): Promise<{ charges: QuotationChargeRecord[]; taxes: QuotationTaxRecord[] }> {
    return prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.findFirst({
        where: { id: quotationId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!quotation) throw new NotFoundError('Quotation not found.')

      await tx.quotationCharge.deleteMany({ where: { quotationId } })
      await tx.quotationTax.deleteMany({ where: { quotationId } })

      if (charges.length > 0) {
        await tx.quotationCharge.createMany({
          data: charges.map((c, i) => ({
            quotationId,
            organizationId: ctx.organizationId,
            quotationItemId: c.quotationItemId ?? null,
            type: c.type,
            scope: c.scope ?? (c.quotationItemId ? 'LINE' : 'HEADER'),
            basis: c.basis ?? 'FIXED_AMOUNT',
            label: c.label,
            rate: c.rate,
            amount: c.amount,
            currency: c.currency,
            isDeduction: c.isDeduction ?? c.type === 'DISCOUNT',
            sequence: c.sequence ?? i,
            isVisibleToCustomer: c.isVisibleToCustomer ?? true,
            notes: c.notes,
          })),
        })
      }
      if (taxes.length > 0) {
        await tx.quotationTax.createMany({
          data: taxes.map((t, i) => ({
            quotationId,
            organizationId: ctx.organizationId,
            quotationItemId: t.quotationItemId ?? null,
            type: t.type,
            code: t.code,
            jurisdiction: t.jurisdiction,
            ratePercent: t.ratePercent,
            taxableAmount: t.taxableAmount,
            amount: t.amount,
            currency: t.currency,
            isCompound: t.isCompound ?? false,
            isReverseCharge: t.isReverseCharge ?? false,
            sequence: t.sequence ?? i,
          })),
        })
      }

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Quotation',
        entityId: quotationId,
        action: 'quotation.conditions_changed',
        after: { charges: charges.length, taxes: taxes.length },
      })

      return {
        charges: await tx.quotationCharge.findMany({
          where: { quotationId, deletedAt: null },
          orderBy: { sequence: 'asc' },
          select: chargeSelect,
        }),
        taxes: await tx.quotationTax.findMany({
          where: { quotationId, deletedAt: null },
          orderBy: { sequence: 'asc' },
          select: taxSelect,
        }),
      }
    })
  },

  listConditions(organizationId: string, quotationId: string) {
    return prisma.$transaction(async (tx) => ({
      charges: await tx.quotationCharge.findMany({
        where: { organizationId, quotationId, deletedAt: null },
        orderBy: { sequence: 'asc' },
        select: chargeSelect,
      }),
      taxes: await tx.quotationTax.findMany({
        where: { organizationId, quotationId, deletedAt: null },
        orderBy: { sequence: 'asc' },
        select: taxSelect,
      }),
    }))
  },
}

export type QuotationSourcingRepository = typeof quotationSourcingRepository
