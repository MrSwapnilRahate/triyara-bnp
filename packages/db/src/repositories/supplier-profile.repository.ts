import type { Prisma } from '@prisma/client'
import { type ManufacturingType } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

const supplierSelect = {
  id: true,
  accountId: true,
  organizationId: true,
  manufacturingType: true,
  businessType: true,
  factorySizeSqm: true,
  employees: true,
  productionCapacity: true,
  annualTurnoverBand: true,
  exportExperienceYears: true,
  primaryMarkets: true,
  exportCountries: true,
  languages: true,
  incoterms: true,
  paymentTerms: true,
  supportedDocuments: true,
  certifications: true,
  leadTimeDays: true,
  moq: true,
  packaging: true,
  oem: true,
  odm: true,
  privateLabel: true,
  website: true,
  socialLinks: true,
  description: true,
  version: true,
  createdById: true,
  updatedById: true,
  deletedById: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  products: {
    select: {
      id: true,
      product: true,
      capacityPerMonth: true,
      moq: true,
      leadTimeDays: true,
      createdAt: true,
    },
    orderBy: { product: 'asc' },
  },
} satisfies Prisma.SupplierProfileSelect

export type SupplierProfileRecord = Prisma.SupplierProfileGetPayload<{
  select: typeof supplierSelect
}>

export interface SupplierProfileData {
  manufacturingType?: ManufacturingType
  businessType?: string
  factorySizeSqm?: number
  employees?: number
  productionCapacity?: string
  annualTurnoverBand?: string
  exportExperienceYears?: number
  primaryMarkets?: string[]
  exportCountries?: string[]
  languages?: string[]
  incoterms?: string[]
  paymentTerms?: string[]
  supportedDocuments?: string[]
  certifications?: string[]
  leadTimeDays?: number
  moq?: string
  packaging?: string
  oem?: boolean
  odm?: boolean
  privateLabel?: boolean
  website?: string
  socialLinks?: Record<string, string>
  description?: string
}

export interface AddProductData {
  product: string
  capacityPerMonth?: string
  moq?: string
  leadTimeDays?: number
}

export interface SupplierProfileRepository {
  create(
    ctx: MutationCtx,
    accountId: string,
    data: SupplierProfileData,
  ): Promise<SupplierProfileRecord>
  findByAccountId(
    orgId: string,
    accountId: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<SupplierProfileRecord | null>
  mutate(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
    data: SupplierProfileData,
    action: string,
  ): Promise<SupplierProfileRecord>
  softDelete(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
  ): Promise<SupplierProfileRecord>
  restore(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
  ): Promise<SupplierProfileRecord>
  addProduct(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
    data: AddProductData,
  ): Promise<SupplierProfileRecord>
  removeProduct(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
    productId: string,
  ): Promise<SupplierProfileRecord>
}

function jsonInput(links?: Record<string, string>): Prisma.InputJsonValue | undefined {
  return links === undefined ? undefined : (links as Prisma.InputJsonValue)
}

async function loadActive(tx: Prisma.TransactionClient, orgId: string, accountId: string) {
  const profile = await tx.supplierProfile.findFirst({
    where: { accountId, organizationId: orgId, deletedAt: null },
    select: supplierSelect,
  })
  if (!profile) throw new NotFoundError('Supplier profile not found.')
  return profile
}

async function refetch(tx: Prisma.TransactionClient, accountId: string) {
  return tx.supplierProfile.findFirstOrThrow({ where: { accountId }, select: supplierSelect })
}

export const supplierProfileRepository: SupplierProfileRepository = {
  async create(ctx, accountId, data) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!account) throw new NotFoundError('Account not found.')

      const existing = await tx.supplierProfile.findUnique({
        where: { accountId },
        select: { id: true, deletedAt: true },
      })
      if (existing) {
        throw new ConflictError(
          existing.deletedAt
            ? 'A supplier profile exists but is deleted. Restore it instead.'
            : 'This account already has a supplier profile.',
        )
      }

      const created = await tx.supplierProfile.create({
        data: {
          accountId,
          organizationId: ctx.organizationId,
          ...data,
          socialLinks: jsonInput(data.socialLinks),
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        },
        select: supplierSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'SupplierProfile',
        entityId: created.id,
        action: 'supplier.created',
        after: created,
      })
      return created
    })
  },

  findByAccountId(orgId, accountId, opts) {
    return prisma.supplierProfile.findFirst({
      where: {
        accountId,
        organizationId: orgId,
        ...(opts?.includeDeleted ? {} : { deletedAt: null }),
      },
      select: supplierSelect,
    })
  },

  async mutate(ctx, accountId, expectedVersion, data, action) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, accountId)
      const res = await tx.supplierProfile.updateMany({
        where: {
          accountId,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          ...data,
          socialLinks: jsonInput(data.socialLinks),
          updatedById: ctx.actorId,
          version: { increment: 1 },
        },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await refetch(tx, accountId)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'SupplierProfile',
        entityId: after.id,
        action,
        before,
        after,
      })
      return after
    })
  },

  async softDelete(ctx, accountId, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, accountId)
      const res = await tx.supplierProfile.updateMany({
        where: {
          accountId,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), deletedById: ctx.actorId, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await refetch(tx, accountId)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'SupplierProfile',
        entityId: after.id,
        action: 'supplier.deleted',
        before,
        after,
      })
      return after
    })
  },

  async restore(ctx, accountId, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.supplierProfile.findFirst({
        where: { accountId, organizationId: ctx.organizationId, deletedAt: { not: null } },
        select: supplierSelect,
      })
      if (!before) throw new NotFoundError('Deleted supplier profile not found.')
      const res = await tx.supplierProfile.updateMany({
        where: {
          accountId,
          organizationId: ctx.organizationId,
          deletedAt: { not: null },
          version: expectedVersion,
        },
        data: { deletedAt: null, deletedById: null, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await refetch(tx, accountId)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'SupplierProfile',
        entityId: after.id,
        action: 'supplier.restored',
        before,
        after,
      })
      return after
    })
  },

  async addProduct(ctx, accountId, expectedVersion, data) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, accountId)
      const bump = await tx.supplierProfile.updateMany({
        where: {
          accountId,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (bump.count === 0) throw new PreconditionFailedError()
      const dup = await tx.supplierProduct.findUnique({
        where: {
          supplierProfileId_product: { supplierProfileId: before.id, product: data.product },
        },
        select: { id: true },
      })
      if (dup) throw new ConflictError('This product is already listed.')
      await tx.supplierProduct.create({ data: { supplierProfileId: before.id, ...data } })
      const after = await refetch(tx, accountId)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'SupplierProfile',
        entityId: after.id,
        action: 'supplier.capability_changed',
        before,
        after,
      })
      return after
    })
  },

  async removeProduct(ctx, accountId, expectedVersion, productId) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, accountId)
      const bump = await tx.supplierProfile.updateMany({
        where: {
          accountId,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (bump.count === 0) throw new PreconditionFailedError()
      const del = await tx.supplierProduct.deleteMany({
        where: { id: productId, supplierProfileId: before.id },
      })
      if (del.count === 0) throw new NotFoundError('Product not found.')
      const after = await refetch(tx, accountId)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'SupplierProfile',
        entityId: after.id,
        action: 'supplier.capability_changed',
        before,
        after,
      })
      return after
    })
  },
}
