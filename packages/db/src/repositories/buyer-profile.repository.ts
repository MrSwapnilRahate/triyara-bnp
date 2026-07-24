import type { Prisma } from '@prisma/client'
import { type BuyerType, type ImportExperience } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

const buyerSelect = {
  id: true,
  accountId: true,
  organizationId: true,
  businessType: true,
  annualRequirement: true,
  annualBudgetBand: true,
  importExperience: true,
  destinationCountries: true,
  destinationPort: true,
  incoterms: true,
  paymentTerms: true,
  certificationsRequired: true,
  languages: true,
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
      targetVolume: true,
      targetPrice: true,
      frequency: true,
      createdAt: true,
    },
    orderBy: { product: 'asc' },
  },
} satisfies Prisma.BuyerProfileSelect

export type BuyerProfileRecord = Prisma.BuyerProfileGetPayload<{ select: typeof buyerSelect }>

export interface BuyerProfileData {
  businessType?: BuyerType
  annualRequirement?: string
  annualBudgetBand?: string
  importExperience?: ImportExperience
  destinationCountries?: string[]
  destinationPort?: string
  incoterms?: string[]
  paymentTerms?: string[]
  certificationsRequired?: string[]
  languages?: string[]
  website?: string
  socialLinks?: Record<string, string>
  description?: string
}

export interface AddBuyerProductData {
  product: string
  targetVolume?: string
  targetPrice?: string
  frequency?: string
}

export interface BuyerProfileRepository {
  create(ctx: MutationCtx, accountId: string, data: BuyerProfileData): Promise<BuyerProfileRecord>
  findByAccountId(
    orgId: string,
    accountId: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<BuyerProfileRecord | null>
  mutate(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
    data: BuyerProfileData,
    action: string,
  ): Promise<BuyerProfileRecord>
  softDelete(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
  ): Promise<BuyerProfileRecord>
  restore(ctx: MutationCtx, accountId: string, expectedVersion: number): Promise<BuyerProfileRecord>
  addProduct(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
    data: AddBuyerProductData,
  ): Promise<BuyerProfileRecord>
  removeProduct(
    ctx: MutationCtx,
    accountId: string,
    expectedVersion: number,
    productId: string,
  ): Promise<BuyerProfileRecord>
}

function jsonInput(links?: Record<string, string>): Prisma.InputJsonValue | undefined {
  return links === undefined ? undefined : (links as Prisma.InputJsonValue)
}

async function loadActive(tx: Prisma.TransactionClient, orgId: string, accountId: string) {
  const profile = await tx.buyerProfile.findFirst({
    where: { accountId, organizationId: orgId, deletedAt: null },
    select: buyerSelect,
  })
  if (!profile) throw new NotFoundError('Buyer profile not found.')
  return profile
}

function refetch(tx: Prisma.TransactionClient, accountId: string) {
  return tx.buyerProfile.findFirstOrThrow({ where: { accountId }, select: buyerSelect })
}

export const buyerProfileRepository: BuyerProfileRepository = {
  async create(ctx, accountId, data) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!account) throw new NotFoundError('Account not found.')

      const existing = await tx.buyerProfile.findUnique({
        where: { accountId },
        select: { id: true, deletedAt: true },
      })
      if (existing) {
        throw new ConflictError(
          existing.deletedAt
            ? 'A buyer profile exists but is deleted. Restore it instead.'
            : 'This account already has a buyer profile.',
        )
      }

      const created = await tx.buyerProfile.create({
        data: {
          accountId,
          organizationId: ctx.organizationId,
          ...data,
          socialLinks: jsonInput(data.socialLinks),
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        },
        select: buyerSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'BuyerProfile',
        entityId: created.id,
        action: 'buyer.created',
        after: created,
      })
      return created
    })
  },

  findByAccountId(orgId, accountId, opts) {
    return prisma.buyerProfile.findFirst({
      where: {
        accountId,
        organizationId: orgId,
        ...(opts?.includeDeleted ? {} : { deletedAt: null }),
      },
      select: buyerSelect,
    })
  },

  async mutate(ctx, accountId, expectedVersion, data, action) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, accountId)
      const res = await tx.buyerProfile.updateMany({
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
        entityType: 'BuyerProfile',
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
      const res = await tx.buyerProfile.updateMany({
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
        entityType: 'BuyerProfile',
        entityId: after.id,
        action: 'buyer.deleted',
        before,
        after,
      })
      return after
    })
  },

  async restore(ctx, accountId, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.buyerProfile.findFirst({
        where: { accountId, organizationId: ctx.organizationId, deletedAt: { not: null } },
        select: buyerSelect,
      })
      if (!before) throw new NotFoundError('Deleted buyer profile not found.')
      const res = await tx.buyerProfile.updateMany({
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
        entityType: 'BuyerProfile',
        entityId: after.id,
        action: 'buyer.restored',
        before,
        after,
      })
      return after
    })
  },

  async addProduct(ctx, accountId, expectedVersion, data) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, accountId)
      const bump = await tx.buyerProfile.updateMany({
        where: {
          accountId,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (bump.count === 0) throw new PreconditionFailedError()
      const dup = await tx.buyerProduct.findUnique({
        where: { buyerProfileId_product: { buyerProfileId: before.id, product: data.product } },
        select: { id: true },
      })
      if (dup) throw new ConflictError('This product is already listed.')
      await tx.buyerProduct.create({ data: { buyerProfileId: before.id, ...data } })
      const after = await refetch(tx, accountId)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'BuyerProfile',
        entityId: after.id,
        action: 'buyer.capability_changed',
        before,
        after,
      })
      return after
    })
  },

  async removeProduct(ctx, accountId, expectedVersion, productId) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, accountId)
      const bump = await tx.buyerProfile.updateMany({
        where: {
          accountId,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (bump.count === 0) throw new PreconditionFailedError()
      const del = await tx.buyerProduct.deleteMany({
        where: { id: productId, buyerProfileId: before.id },
      })
      if (del.count === 0) throw new NotFoundError('Product not found.')
      const after = await refetch(tx, accountId)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'BuyerProfile',
        entityId: after.id,
        action: 'buyer.capability_changed',
        before,
        after,
      })
      return after
    })
  },
}
