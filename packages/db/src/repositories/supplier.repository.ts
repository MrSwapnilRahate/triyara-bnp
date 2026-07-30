import {
  type ApprovalDecision,
  type CertificationType,
  Prisma,
  type SupplierBusinessType,
  type SupplierStatus,
} from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Supplier master data (TRY-BNP-SUPPLIER-02). Aggregate root; owned collections
// (contacts, addresses, bank accounts, certifications) are replaced wholesale so
// a write is a bounded number of statements regardless of collection size.

/** Narrow list projection - deliberately excludes every owned collection. */
const listSelect = {
  id: true,
  organizationId: true,
  supplierCode: true,
  companyName: true,
  legalName: true,
  businessType: true,
  email: true,
  phone: true,
  country: true,
  state: true,
  city: true,
  status: true,
  isVerified: true,
  verifiedAt: true,
  accountId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.SupplierSelect

const detailSelect = {
  ...listSelect,
  website: true,
  gstNumber: true,
  iecNumber: true,
  panNumber: true,
  contacts: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      name: true,
      role: true,
      designation: true,
      email: true,
      phone: true,
      isPrimary: true,
    },
  },
  addresses: {
    where: { deletedAt: null },
    orderBy: { isPrimary: 'desc' },
    select: {
      id: true,
      type: true,
      line1: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      isPrimary: true,
      factorySizeSqm: true,
      productionLines: true,
      employeeCount: true,
    },
  },
  bankAccounts: {
    where: { deletedAt: null },
    orderBy: { isPrimary: 'desc' },
    // accountNumber is deliberately NOT selected - see the security note below.
    select: {
      id: true,
      bankName: true,
      branchName: true,
      accountHolderName: true,
      ifscCode: true,
      swiftCode: true,
      currency: true,
      isPrimary: true,
      isVerified: true,
    },
  },
  certifications: {
    where: { deletedAt: null },
    orderBy: { expiryDate: 'asc' },
    select: {
      id: true,
      type: true,
      certificateNumber: true,
      issuedBy: true,
      issuedDate: true,
      expiryDate: true,
      status: true,
      scope: true,
    },
  },
  tags: { select: { tagId: true, tag: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.SupplierSelect

export type SupplierListItem = Prisma.SupplierGetPayload<{ select: typeof listSelect }>
export type SupplierRecord = Prisma.SupplierGetPayload<{ select: typeof detailSelect }>

export interface CreateSupplierData {
  supplierCode: string
  companyName: string
  legalName: string
  businessType: SupplierBusinessType
  email?: string
  phone?: string
  website?: string
  gstNumber?: string
  iecNumber?: string
  panNumber?: string
  country?: string
  state?: string
  city?: string
  accountId?: string
}

export type UpdateSupplierData = Partial<CreateSupplierData>

export interface ListSuppliersParams {
  organizationId: string
  q?: string
  status?: SupplierStatus
  businessType?: SupplierBusinessType
  country?: string
  city?: string
  isVerified?: boolean
  productId?: string
  tagId?: string
  gstNumber?: string
  iecNumber?: string
  panNumber?: string
  includeDeleted?: boolean
  sort?: string
  limit: number
  cursor?: string
}

export interface SupplierListResult {
  items: SupplierListItem[]
  nextCursor: string | null
}

function conflictOnUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta as { target?: string[] | string } | undefined)?.target
    const t = Array.isArray(target) ? target.join(',') : String(target ?? '')
    if (t.includes('gst')) throw new ConflictError('That GST number is already registered.')
    if (t.includes('iec')) throw new ConflictError('That IEC number is already registered.')
    if (t.includes('pan')) throw new ConflictError('That PAN is already registered.')
    if (t.includes('accountId'))
      throw new ConflictError('That account is already linked to a supplier.')
    throw new ConflictError('A supplier with that code already exists.')
  }
  throw error
}

export const supplierRepository = {
  async create(ctx: MutationCtx, data: CreateSupplierData): Promise<SupplierRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: { organizationId: ctx.organizationId, ...data, createdById: ctx.actorId },
          select: detailSelect,
        })

        // Onboarding starts in DRAFT; the transition is recorded so the approval
        // history is complete from the first event.
        await tx.supplierApproval.create({
          data: {
            supplierId: supplier.id,
            organizationId: ctx.organizationId,
            fromStatus: null,
            toStatus: 'DRAFT',
            decision: 'SUBMITTED',
            reviewerId: ctx.actorId,
            comments: 'Supplier record created.',
          },
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Supplier',
          entityId: supplier.id,
          action: 'supplier.created',
          after: { supplierCode: supplier.supplierCode, companyName: supplier.companyName },
        })

        return supplier
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<SupplierRecord | null> {
    return prisma.supplier.findFirst({
      where: { id, organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  findByCode(organizationId: string, supplierCode: string): Promise<SupplierRecord | null> {
    return prisma.supplier.findFirst({
      where: { organizationId, supplierCode },
      select: detailSelect,
    })
  },

  async list(params: ListSuppliersParams): Promise<SupplierListResult> {
    const where: Prisma.SupplierWhereInput = {
      organizationId: params.organizationId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.status ? { status: params.status } : {}),
      ...(params.businessType ? { businessType: params.businessType } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.city ? { city: { contains: params.city, mode: 'insensitive' } } : {}),
      ...(params.isVerified === undefined ? {} : { isVerified: params.isVerified }),
      ...(params.gstNumber ? { gstNumber: params.gstNumber } : {}),
      ...(params.iecNumber ? { iecNumber: params.iecNumber } : {}),
      ...(params.panNumber ? { panNumber: params.panNumber } : {}),
      ...(params.tagId ? { tags: { some: { tagId: params.tagId } } } : {}),
      // "Who supplies product X?" - the sourcing question.
      ...(params.productId
        ? { offerings: { some: { productId: params.productId, deletedAt: null } } }
        : {}),
      ...(params.q
        ? {
            OR: [
              { companyName: { contains: params.q, mode: 'insensitive' } },
              { legalName: { contains: params.q, mode: 'insensitive' } },
              { supplierCode: { contains: params.q, mode: 'insensitive' } },
              { city: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const raw = params.sort ?? '-createdAt'
    const dir: Prisma.SortOrder = raw.startsWith('-') ? 'desc' : 'asc'
    const field = raw.replace(/^-/, '') as 'createdAt' | 'companyName' | 'supplierCode'

    const rows = await prisma.supplier.findMany({
      where,
      select: listSelect,
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  async mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateSupplierData,
  ): Promise<SupplierRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const before = await tx.supplier.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: listSelect,
        })
        if (!before) throw new NotFoundError('Supplier not found.')

        const updated = await tx.supplier.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...data, updatedById: ctx.actorId, version: { increment: 1 } },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        const after = await tx.supplier.findUniqueOrThrow({ where: { id }, select: detailSelect })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Supplier',
          entityId: id,
          action: 'supplier.updated',
          before,
          after: { supplierCode: after.supplierCode, companyName: after.companyName },
        })
        return after
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  /**
   * Records an approval transition and moves the supplier's denormalised status
   * in the same transaction, so the append-only history and the current state
   * can never disagree.
   */
  async transition(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    toStatus: SupplierStatus,
    decision: ApprovalDecision,
    comments?: string,
  ): Promise<SupplierRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.supplier.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: listSelect,
      })
      if (!before) throw new NotFoundError('Supplier not found.')
      if (before.status === toStatus) {
        throw new ConflictError(`Supplier is already ${toStatus}.`)
      }

      const updated = await tx.supplier.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          status: toStatus,
          updatedById: ctx.actorId,
          version: { increment: 1 },
          ...(toStatus === 'APPROVED' ? { isVerified: true, verifiedAt: new Date() } : {}),
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      await tx.supplierApproval.create({
        data: {
          supplierId: id,
          organizationId: ctx.organizationId,
          fromStatus: before.status,
          toStatus,
          decision,
          reviewerId: ctx.actorId,
          comments,
        },
      })

      const after = await tx.supplier.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: id,
        action: `supplier.${decision.toLowerCase()}`,
        before: { status: before.status },
        after: { status: after.status },
      })
      return after
    })
  },

  /** Approval history, newest first. Append-only, so never edited. */
  approvalHistory(organizationId: string, supplierId: string) {
    return prisma.supplierApproval.findMany({
      where: { organizationId, supplierId },
      orderBy: { reviewedAt: 'desc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        decision: true,
        reviewerId: true,
        comments: true,
        reviewedAt: true,
      },
    })
  },

  async softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<SupplierRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.supplier.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: listSelect,
      })
      if (!before) throw new NotFoundError('Supplier not found.')

      const updated = await tx.supplier.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          deletedAt: new Date(),
          deletedById: ctx.actorId,
          status: 'INACTIVE',
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplier.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: id,
        action: 'supplier.deleted',
        before,
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },

  async restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<SupplierRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.supplier.findFirst({
        where: { id, organizationId: ctx.organizationId, NOT: { deletedAt: null } },
        select: listSelect,
      })
      if (!before) throw new NotFoundError('Deleted supplier not found.')

      const updated = await tx.supplier.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { deletedAt: null, deletedById: null, status: 'DRAFT', version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplier.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: id,
        action: 'supplier.restored',
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },

  // ---- Owned collections, replaced wholesale ----

  async replaceContacts(
    ctx: MutationCtx,
    supplierId: string,
    contacts: Array<
      Prisma.SupplierContactCreateManyInput extends never ? never : Record<string, unknown>
    >,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.supplierContact.deleteMany({ where: { supplierId } })
      if (contacts.length > 0) {
        await tx.supplierContact.createMany({
          data: contacts.map((c, i) => ({
            ...(c as object),
            supplierId,
            organizationId: ctx.organizationId,
            sortOrder: i * 10,
          })) as Prisma.SupplierContactCreateManyInput[],
        })
      }
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: supplierId,
        action: 'supplier.contacts_changed',
        after: { count: contacts.length },
      })
    })
  },

  /** Certifications expiring within `days`, for the compliance sweep. */
  expiringCertifications(organizationId: string, days: number) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    return prisma.supplierCertification.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        expiryDate: { not: null, lte: until },
      },
      orderBy: { expiryDate: 'asc' },
      select: {
        id: true,
        supplierId: true,
        type: true,
        certificateNumber: true,
        expiryDate: true,
        supplier: { select: { id: true, supplierCode: true, companyName: true } },
      },
    })
  },

  /**
   * Distinct countries in use, with a supplier count each. Drives the filter
   * vocabulary for `GET /api/suppliers?country=`: a static ISO list would offer
   * 249 options where this tenant has a handful, most of them empty.
   *
   * Read-only aggregation - no row is written and no business rule is applied.
   */
  async countryFacets(
    organizationId: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<Array<{ country: string; suppliers: number }>> {
    const rows = await prisma.supplier.groupBy({
      by: ['country'],
      where: {
        organizationId,
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
        country: { not: null },
      },
      _count: { _all: true },
      orderBy: { country: 'asc' },
    })
    // `country` is nullable in the datamodel; the predicate above excludes nulls,
    // but the generated type does not narrow, so filter rather than assert.
    return rows.flatMap((r) =>
      r.country ? [{ country: r.country, suppliers: r._count._all }] : [],
    )
  },

  /**
   * Certification types held across the tenant, with a count and how many are
   * currently ACTIVE. Same purpose as `countryFacets`: what this tenant actually
   * has, not what the enum permits.
   */
  async certificationFacets(
    organizationId: string,
  ): Promise<Array<{ type: CertificationType; total: number; active: number }>> {
    const [totals, actives] = await Promise.all([
      prisma.supplierCertification.groupBy({
        by: ['type'],
        where: { organizationId, deletedAt: null },
        _count: { _all: true },
        orderBy: { type: 'asc' },
      }),
      prisma.supplierCertification.groupBy({
        by: ['type'],
        where: { organizationId, deletedAt: null, status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ])
    const activeByType = new Map(actives.map((a) => [a.type, a._count._all]))
    return totals.map((t) => ({
      type: t.type,
      total: t._count._all,
      active: activeByType.get(t.type) ?? 0,
    }))
  },
}

export type SupplierRepository = typeof supplierRepository
