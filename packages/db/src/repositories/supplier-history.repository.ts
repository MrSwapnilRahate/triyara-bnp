import type { Prisma } from '@prisma/client'
import { NotFoundError } from '@triyara/lib'

import { prisma } from '../client'
import { decodeCursor, encodeCursor } from './account.repository'

// A supplier's trading history (TRY-BNP-SUPPLIER-MATCH).
//
// These run the OPPOSITE way to every existing query. `rfqSupplierRepository`
// answers "which suppliers were invited to this RFQ"; sourcing asks "what has
// this supplier been asked for before, and what did they say" — which is the
// question a shortlist is settled by. Both directions are already indexed
// (`RFQSupplier(supplierId)`, `QuotationSourceOption(organizationId, supplierId)`),
// so this adds reads, not structure.
//
// Read-only by design. Nothing here writes, so nothing here needs a version.

const rfqHistorySelect = {
  id: true,
  status: true,
  invitedAt: true,
  viewedAt: true,
  respondedAt: true,
  submittedAt: true,
  isLate: true,
  quotationTotal: true,
  quotationCurrency: true,
  quotationValidUntil: true,
  rfq: {
    select: {
      id: true,
      rfqNumber: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
    },
  },
} satisfies Prisma.RFQSupplierSelect

export type SupplierRfqHistoryItem = Prisma.RFQSupplierGetPayload<{
  select: typeof rfqHistorySelect
}>

const quotationHistorySelect = {
  id: true,
  supplierId: true,
  supplierPrice: true,
  supplierCurrency: true,
  landedUnitCost: true,
  moq: true,
  leadTimeDays: true,
  incoterm: true,
  port: true,
  rank: true,
  // Whether we actually went with them. The single most useful fact in this
  // list: a supplier quoted ten times and chosen once reads very differently
  // from one chosen every time.
  isSelected: true,
  createdAt: true,
  quotationItem: {
    select: {
      id: true,
      description: true,
      quotation: {
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          currency: true,
          validUntil: true,
          createdAt: true,
        },
      },
    },
  },
} satisfies Prisma.QuotationSourceOptionSelect

export type SupplierQuotationHistoryItem = Prisma.QuotationSourceOptionGetPayload<{
  select: typeof quotationHistorySelect
}>

export interface HistoryParams {
  organizationId: string
  supplierId: string
  limit: number
  cursor?: string
}

export interface HistoryResult<T> {
  items: T[]
  nextCursor: string | null
}

async function assertVisible(organizationId: string, supplierId: string): Promise<void> {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!supplier) throw new NotFoundError('Supplier not found.')
}

export const supplierHistoryRepository = {
  assertVisible,

  /** Every RFQ this supplier was invited to, most recent first. */
  async rfqs(params: HistoryParams): Promise<HistoryResult<SupplierRfqHistoryItem>> {
    const rows = await prisma.rFQSupplier.findMany({
      where: {
        organizationId: params.organizationId,
        supplierId: params.supplierId,
        deletedAt: null,
      },
      select: rfqHistorySelect,
      orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /** Every quotation this supplier was costed into, most recent first. */
  async quotations(params: HistoryParams): Promise<HistoryResult<SupplierQuotationHistoryItem>> {
    const rows = await prisma.quotationSourceOption.findMany({
      where: {
        organizationId: params.organizationId,
        supplierId: params.supplierId,
        deletedAt: null,
      },
      select: quotationHistorySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },
}

export type SupplierHistoryRepository = typeof supplierHistoryRepository
