import type { Prisma } from '@prisma/client'
import { Prisma as P } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Cross-cutting master data for the Quotation Engine (TRY-BNP-QUOTE-01):
// payment terms and temporal FX rates. Both are deliberately generic - Purchase
// Orders and Invoices will reference the same entities.

const termSelect = {
  id: true,
  organizationId: true,
  code: true,
  name: true,
  description: true,
  netDays: true,
  advancePercent: true,
  isActive: true,
  sortOrder: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.PaymentTermSelect

const rateSelect = {
  id: true,
  organizationId: true,
  fromCurrency: true,
  toCurrency: true,
  rate: true,
  effectiveFrom: true,
  effectiveTo: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExchangeRateSelect

export type PaymentTermRecord = Prisma.PaymentTermGetPayload<{ select: typeof termSelect }>
export type ExchangeRateRecord = Prisma.ExchangeRateGetPayload<{ select: typeof rateSelect }>

export interface PaymentTermData {
  code: string
  name: string
  description?: string
  netDays?: number
  advancePercent?: number
  isActive?: boolean
  sortOrder?: number
}

export interface ExchangeRateData {
  fromCurrency: string
  toCurrency: string
  rate: number
  effectiveFrom: Date
  effectiveTo?: Date
  source?: Prisma.ExchangeRateCreateInput['source']
}

export interface ListReferenceParams {
  organizationId: string
  limit: number
  cursor?: string
}

export const quotationReferenceRepository = {
  // ---- Payment terms ----

  async createPaymentTerm(ctx: MutationCtx, data: PaymentTermData): Promise<PaymentTermRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const term = await tx.paymentTerm.create({
          data: { organizationId: ctx.organizationId, ...data },
          select: termSelect,
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'PaymentTerm',
          entityId: term.id,
          action: 'payment_term.created',
          after: { code: term.code, netDays: term.netDays },
        })
        return term
      })
    } catch (error) {
      if (error instanceof P.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('A payment term with that code already exists.')
      }
      throw error
    }
  },

  findPaymentTerm(organizationId: string, id: string): Promise<PaymentTermRecord | null> {
    return prisma.paymentTerm.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: termSelect,
    })
  },

  findPaymentTermByCode(organizationId: string, code: string): Promise<PaymentTermRecord | null> {
    return prisma.paymentTerm.findFirst({ where: { organizationId, code }, select: termSelect })
  },

  async listPaymentTerms(params: ListReferenceParams & { isActive?: boolean }) {
    const rows = await prisma.paymentTerm.findMany({
      where: {
        organizationId: params.organizationId,
        deletedAt: null,
        ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      },
      select: termSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })
    const items = rows.slice(0, params.limit)
    return {
      items,
      nextCursor: rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null,
    }
  },

  async mutatePaymentTerm(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: Partial<PaymentTermData>,
  ): Promise<PaymentTermRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.paymentTerm.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: termSelect,
      })
      if (!before) throw new NotFoundError('Payment term not found.')

      const updated = await tx.paymentTerm.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { ...data, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.paymentTerm.findUniqueOrThrow({ where: { id }, select: termSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'PaymentTerm',
        entityId: id,
        action: 'payment_term.updated',
        before: { code: before.code, netDays: before.netDays },
        after: { code: after.code, netDays: after.netDays },
      })
      return after
    })
  },

  // ---- Exchange rates ----

  async createExchangeRate(ctx: MutationCtx, data: ExchangeRateData): Promise<ExchangeRateRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const rate = await tx.exchangeRate.create({
          data: { organizationId: ctx.organizationId, ...data, createdById: ctx.actorId },
          select: rateSelect,
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'ExchangeRate',
          entityId: rate.id,
          action: 'exchange_rate.created',
          after: {
            pair: `${rate.fromCurrency}/${rate.toCurrency}`,
            rate: rate.rate.toString(),
            effectiveFrom: rate.effectiveFrom,
          },
        })
        return rate
      })
    } catch (error) {
      if (error instanceof P.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('A rate for that pair and effective date already exists.')
      }
      throw error
    }
  },

  /**
   * The rate in force for a pair on a given date. Returns null when none
   * applies, so the caller must decide rather than silently converting at 1.
   */
  findRateOn(
    organizationId: string,
    fromCurrency: string,
    toCurrency: string,
    on: Date,
  ): Promise<ExchangeRateRecord | null> {
    return prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        fromCurrency,
        toCurrency,
        effectiveFrom: { lte: on },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: on } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: rateSelect,
    })
  },

  async listExchangeRates(
    params: ListReferenceParams & { fromCurrency?: string; toCurrency?: string },
  ) {
    const rows = await prisma.exchangeRate.findMany({
      where: {
        organizationId: params.organizationId,
        ...(params.fromCurrency ? { fromCurrency: params.fromCurrency } : {}),
        ...(params.toCurrency ? { toCurrency: params.toCurrency } : {}),
      },
      select: rateSelect,
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })
    const items = rows.slice(0, params.limit)
    return {
      items,
      nextCursor: rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null,
    }
  },
}

export type QuotationReferenceRepository = typeof quotationReferenceRepository
