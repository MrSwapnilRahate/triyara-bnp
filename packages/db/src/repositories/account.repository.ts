import { Prisma, type RelationshipStatus } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { prisma } from '../client'

// ---- Explicit select (no over-fetching, deterministic shape, no N+1) ----
const accountSelect = {
  id: true,
  organizationId: true,
  legalName: true,
  displayName: true,
  country: true,
  relationshipStatus: true,
  source: true,
  ownerId: true,
  createdById: true,
  updatedById: true,
  deletedById: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  owner: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AccountSelect

export type AccountRecord = Prisma.AccountGetPayload<{ select: typeof accountSelect }>

export interface MutationCtx {
  actorId: string
  organizationId: string
  requestId?: string
}

export interface CreateAccountData {
  legalName: string
  displayName?: string
  country?: string
  relationshipStatus?: RelationshipStatus
  source?: string
  ownerId?: string
}

export interface MutateData {
  legalName?: string
  displayName?: string | null
  country?: string | null
  source?: string | null
  ownerId?: string | null
  relationshipStatus?: RelationshipStatus
}

export interface ListAccountsParams {
  limit: number
  cursor?: string
  sort?: string
  q?: string
  country?: string
  relationshipStatus?: RelationshipStatus
  ownerId?: string
  createdFrom?: Date
  createdTo?: Date
  includeDeleted?: boolean
}

export interface AccountListResult {
  items: AccountRecord[]
  nextCursor: string | null
  hasMore: boolean
}

export interface AccountRepository {
  create(ctx: MutationCtx, data: CreateAccountData): Promise<AccountRecord>
  findById(
    orgId: string,
    id: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<AccountRecord | null>
  findActiveByName(orgId: string, legalName: string): Promise<AccountRecord | null>
  list(orgId: string, params: ListAccountsParams): Promise<AccountListResult>
  mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: MutateData,
    action: string,
  ): Promise<AccountRecord>
  softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<AccountRecord>
  restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<AccountRecord>
}

// ---- Opaque cursor (keyset by id; never offset) ----
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url')
}
export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8')
}

const SORT_FIELDS = ['createdAt', 'legalName', 'updatedAt', 'relationshipStatus'] as const
function parseSort(sort?: string): { field: (typeof SORT_FIELDS)[number]; dir: Prisma.SortOrder } {
  const raw = sort ?? '-createdAt'
  const dir: Prisma.SortOrder = raw.startsWith('-') ? 'desc' : 'asc'
  const bare = raw.replace(/^-/, '')
  const field = (SORT_FIELDS as readonly string[]).includes(bare)
    ? (bare as (typeof SORT_FIELDS)[number])
    : 'createdAt'
  return { field, dir }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  ctx: MutationCtx,
  entityId: string,
  action: string,
  before: AccountRecord | null,
  after: AccountRecord | null,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      entityType: 'Account',
      entityId,
      actorId: ctx.actorId,
      action,
      before: before ? toJson(before) : Prisma.JsonNull,
      after: after ? toJson(after) : Prisma.JsonNull,
      requestId: ctx.requestId,
    },
  })
}

async function assertNameFree(
  tx: Prisma.TransactionClient,
  orgId: string,
  legalName: string,
  excludeId?: string,
): Promise<void> {
  const existing = await tx.account.findFirst({
    where: {
      organizationId: orgId,
      deletedAt: null,
      legalName: { equals: legalName, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (existing) throw new ConflictError('An account with this name already exists.')
}

export const accountRepository: AccountRepository = {
  async create(ctx, data) {
    return prisma.$transaction(async (tx) => {
      await assertNameFree(tx, ctx.organizationId, data.legalName)
      const created = await tx.account.create({
        data: {
          organizationId: ctx.organizationId,
          legalName: data.legalName,
          displayName: data.displayName,
          country: data.country,
          relationshipStatus: data.relationshipStatus,
          source: data.source,
          ownerId: data.ownerId,
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        },
        select: accountSelect,
      })
      await writeAudit(tx, ctx, created.id, 'account.created', null, created)
      return created
    })
  },

  findById(orgId, id, opts) {
    return prisma.account.findFirst({
      where: { id, organizationId: orgId, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
      select: accountSelect,
    })
  },

  findActiveByName(orgId, legalName) {
    return prisma.account.findFirst({
      where: {
        organizationId: orgId,
        deletedAt: null,
        legalName: { equals: legalName, mode: 'insensitive' },
      },
      select: accountSelect,
    })
  },

  async list(orgId, params) {
    const { field, dir } = parseSort(params.sort)
    const where: Prisma.AccountWhereInput = {
      organizationId: orgId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.country ? { country: params.country } : {}),
      ...(params.relationshipStatus ? { relationshipStatus: params.relationshipStatus } : {}),
      ...(params.ownerId ? { ownerId: params.ownerId } : {}),
      ...(params.createdFrom || params.createdTo
        ? { createdAt: { gte: params.createdFrom, lte: params.createdTo } }
        : {}),
      ...(params.q
        ? {
            OR: [
              { legalName: { contains: params.q, mode: 'insensitive' } },
              { displayName: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const orderBy: Prisma.AccountOrderByWithRelationInput[] = [{ [field]: dir }, { id: dir }]

    const rows = await prisma.account.findMany({
      where,
      orderBy,
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
      select: accountSelect,
    })

    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const last = items.at(-1)
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null }
  },

  async mutate(ctx, id, expectedVersion, data, action) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.account.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: accountSelect,
      })
      if (!before) throw new NotFoundError('Account not found.')
      if (data.legalName && data.legalName.toLowerCase() !== before.legalName.toLowerCase()) {
        await assertNameFree(tx, ctx.organizationId, data.legalName, id)
      }

      const updated = await tx.account.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { ...data, updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.account.findUniqueOrThrow({ where: { id }, select: accountSelect })
      await writeAudit(tx, ctx, id, action, before, after)
      return after
    })
  },

  async softDelete(ctx, id, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.account.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: accountSelect,
      })
      if (!before) throw new NotFoundError('Account not found.')

      const res = await tx.account.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), deletedById: ctx.actorId, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()

      const after = await tx.account.findUniqueOrThrow({ where: { id }, select: accountSelect })
      await writeAudit(tx, ctx, id, 'account.deleted', before, after)
      return after
    })
  },

  async restore(ctx, id, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.account.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: { not: null } },
        select: accountSelect,
      })
      if (!before) throw new NotFoundError('Deleted account not found.')
      await assertNameFree(tx, ctx.organizationId, before.legalName, id)

      const res = await tx.account.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: { not: null },
          version: expectedVersion,
        },
        data: { deletedAt: null, deletedById: null, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()

      const after = await tx.account.findUniqueOrThrow({ where: { id }, select: accountSelect })
      await writeAudit(tx, ctx, id, 'account.restored', before, after)
      return after
    })
  },
}
