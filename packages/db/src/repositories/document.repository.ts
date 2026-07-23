import type { Prisma } from '@prisma/client'
import { type DocumentStatus, type DocumentType } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

const listSelect = {
  id: true,
  organizationId: true,
  accountId: true,
  supplierProfileId: true,
  type: true,
  status: true,
  title: true,
  issuedDate: true,
  expiryDate: true,
  currentFileVersion: true,
  currentMimeType: true,
  currentOriginalFilename: true,
  currentFileSize: true,
  version: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect

const detailSelect = {
  ...listSelect,
  currentStorageKey: true,
  currentChecksum: true,
  createdById: true,
  updatedById: true,
  versions: {
    select: {
      id: true,
      versionNumber: true,
      mimeType: true,
      originalFilename: true,
      fileSize: true,
      checksum: true,
      uploadedById: true,
      createdAt: true,
    },
    orderBy: { versionNumber: 'desc' },
  },
} satisfies Prisma.DocumentSelect

export type DocumentListItem = Prisma.DocumentGetPayload<{ select: typeof listSelect }>
export type DocumentRecord = Prisma.DocumentGetPayload<{ select: typeof detailSelect }>

export interface CreateDocumentInput {
  accountId: string
  supplierProfileId?: string
  type: DocumentType
  title: string
  mimeType: string
  originalFilename: string
  storageKey: string
  fileSize: number
  checksum: string
  issuedDate?: Date
  expiryDate?: Date
}

export interface UpdateDocumentInput {
  title?: string
  type?: DocumentType
  status?: DocumentStatus
  supplierProfileId?: string | null
  issuedDate?: Date | null
  expiryDate?: Date | null
}

export interface NewVersionInput {
  storageKey: string
  mimeType: string
  originalFilename: string
  fileSize: number
  checksum: string
}

export interface ListDocumentsParams {
  limit: number
  cursor?: string
  sort?: string
  q?: string
  accountId?: string
  supplierProfileId?: string
  type?: DocumentType
  status?: DocumentStatus
  expiringBefore?: Date
  includeDeleted?: boolean
}

const SORTABLE = new Set(['createdAt', 'title', 'expiryDate', 'status'])

export interface DocumentRepository {
  create(ctx: MutationCtx, input: CreateDocumentInput): Promise<DocumentRecord>
  findById(
    orgId: string,
    id: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<DocumentRecord | null>
  list(
    orgId: string,
    params: ListDocumentsParams,
  ): Promise<{ items: DocumentListItem[]; nextCursor: string | null; hasMore: boolean }>
  mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateDocumentInput,
    action: string,
  ): Promise<DocumentRecord>
  softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<DocumentRecord>
  restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<DocumentRecord>
  addVersion(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    input: NewVersionInput,
  ): Promise<DocumentRecord>
  markExpired(orgId: string): Promise<string[]>
}

async function loadActive(tx: Prisma.TransactionClient, orgId: string, id: string) {
  const doc = await tx.document.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: detailSelect,
  })
  if (!doc) throw new NotFoundError('Document not found.')
  return doc
}

export const documentRepository: DocumentRepository = {
  async create(ctx, input) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: input.accountId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!account) throw new NotFoundError('Account not found.')

      const dup = await tx.document.findFirst({
        where: {
          organizationId: ctx.organizationId,
          accountId: input.accountId,
          type: input.type,
          currentChecksum: input.checksum,
          deletedAt: null,
        },
        select: { id: true },
      })
      if (dup)
        throw new ConflictError('An identical document already exists for this account and type.')

      const created = await tx.document.create({
        data: {
          organizationId: ctx.organizationId,
          accountId: input.accountId,
          supplierProfileId: input.supplierProfileId,
          type: input.type,
          title: input.title,
          issuedDate: input.issuedDate,
          expiryDate: input.expiryDate,
          currentFileVersion: 1,
          currentStorageKey: input.storageKey,
          currentMimeType: input.mimeType,
          currentOriginalFilename: input.originalFilename,
          currentFileSize: input.fileSize,
          currentChecksum: input.checksum,
          status: 'RECEIVED',
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
          versions: {
            create: {
              versionNumber: 1,
              storageKey: input.storageKey,
              mimeType: input.mimeType,
              originalFilename: input.originalFilename,
              fileSize: input.fileSize,
              checksum: input.checksum,
              uploadedById: ctx.actorId,
            },
          },
        },
        select: detailSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Document',
        entityId: created.id,
        action: 'document.uploaded',
        after: created,
      })
      return created
    })
  },

  findById(orgId, id, opts) {
    return prisma.document.findFirst({
      where: { id, organizationId: orgId, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  async list(orgId, params) {
    const desc = !params.sort || params.sort.startsWith('-')
    const rawField = params.sort?.replace(/^-/, '') ?? 'createdAt'
    const field = SORTABLE.has(rawField) ? rawField : 'createdAt'
    const dir: Prisma.SortOrder = desc ? 'desc' : 'asc'

    const where: Prisma.DocumentWhereInput = {
      organizationId: orgId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.supplierProfileId ? { supplierProfileId: params.supplierProfileId } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.expiringBefore ? { expiryDate: { lte: params.expiringBefore } } : {}),
      ...(params.q ? { title: { contains: params.q, mode: 'insensitive' } } : {}),
    }

    const cursorId = params.cursor ? decodeCursor(params.cursor) : undefined
    const rows = await prisma.document.findMany({
      where,
      select: listSelect,
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })
    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const last = items.at(-1)
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null }
  },

  async mutate(ctx, id, expectedVersion, data, action) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, id)
      const res = await tx.document.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { ...data, updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await tx.document.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Document',
        entityId: id,
        action,
        before,
        after,
      })
      return after
    })
  },

  async softDelete(ctx, id, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, id)
      const res = await tx.document.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), deletedById: ctx.actorId, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await tx.document.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Document',
        entityId: id,
        action: 'document.deleted',
        before,
        after,
      })
      return after
    })
  },

  async restore(ctx, id, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.document.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: { not: null } },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Deleted document not found.')
      const res = await tx.document.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: { not: null },
          version: expectedVersion,
        },
        data: { deletedAt: null, deletedById: null, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await tx.document.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Document',
        entityId: id,
        action: 'document.restored',
        before,
        after,
      })
      return after
    })
  },

  async addVersion(ctx, id, expectedVersion, input) {
    return prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, ctx.organizationId, id)
      const nextNumber = before.currentFileVersion + 1
      const res = await tx.document.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          currentFileVersion: nextNumber,
          currentStorageKey: input.storageKey,
          currentMimeType: input.mimeType,
          currentOriginalFilename: input.originalFilename,
          currentFileSize: input.fileSize,
          currentChecksum: input.checksum,
          updatedById: ctx.actorId,
          version: { increment: 1 },
        },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      await tx.documentVersion.create({
        data: {
          documentId: id,
          versionNumber: nextNumber,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          originalFilename: input.originalFilename,
          fileSize: input.fileSize,
          checksum: input.checksum,
          uploadedById: ctx.actorId,
        },
      })
      const after = await tx.document.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Document',
        entityId: id,
        action: 'document.version_created',
        before,
        after,
      })
      return after
    })
  },

  async markExpired(orgId) {
    const now = new Date()
    const due = await prisma.document.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        expiryDate: { lt: now },
        status: { not: 'EXPIRED' },
      },
      select: { id: true },
    })
    if (due.length === 0) return []
    await prisma.document.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'EXPIRED', version: { increment: 1 } },
    })
    return due.map((d) => d.id)
  },
}
