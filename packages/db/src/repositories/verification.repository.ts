import type { Prisma } from '@prisma/client'
import {
  type VerificationDecision,
  type VerificationItemStatus,
  type VerificationStatus,
} from '@prisma/client'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

const listSelect = {
  id: true,
  organizationId: true,
  accountId: true,
  supplierProfileId: true,
  status: true,
  decision: true,
  reason: true,
  reviewerId: true,
  requiredDocumentTypes: true,
  submittedAt: true,
  decidedAt: true,
  expiresAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VerificationSelect

const detailSelect = {
  ...listSelect,
  createdById: true,
  updatedById: true,
  reviews: {
    select: {
      id: true,
      documentId: true,
      documentType: true,
      status: true,
      note: true,
      reviewedById: true,
      reviewedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  notes: {
    select: { id: true, authorId: true, body: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.VerificationSelect

const historySelect = {
  id: true,
  fromStatus: true,
  toStatus: true,
  action: true,
  actorId: true,
  reason: true,
  createdAt: true,
} satisfies Prisma.VerificationHistorySelect

export type VerificationListItem = Prisma.VerificationGetPayload<{ select: typeof listSelect }>
export type VerificationRecord = Prisma.VerificationGetPayload<{ select: typeof detailSelect }>
export type VerificationHistoryItem = Prisma.VerificationHistoryGetPayload<{
  select: typeof historySelect
}>

export interface CreateVerificationInput {
  accountId: string
  supplierProfileId?: string
  requiredDocumentTypes: string[]
}

export interface VerificationPatch {
  status?: VerificationStatus
  requiredDocumentTypes?: string[]
  reviewerId?: string | null
  decision?: VerificationDecision | null
  reason?: string | null
  submittedAt?: Date | null
  decidedAt?: Date | null
  expiresAt?: Date | null
}

export interface HistoryEntry {
  fromStatus: VerificationStatus | null
  toStatus: VerificationStatus
  action: string
  reason?: string
}

export interface ReviewDocumentInput {
  documentId: string
  documentType: string
  status: VerificationItemStatus
  note?: string
}

export interface ListVerificationsParams {
  limit: number
  cursor?: string
  sort?: string
  status?: VerificationStatus
  accountId?: string
  reviewerId?: string
}

const OCCUPYING: VerificationStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'DOCUMENTS_REQUESTED',
  'IN_REVIEW',
  'VERIFIED',
  'SUSPENDED',
]
const SORTABLE = new Set(['createdAt', 'submittedAt', 'status'])

export interface VerificationRepository {
  create(ctx: MutationCtx, input: CreateVerificationInput): Promise<VerificationRecord>
  findById(orgId: string, id: string): Promise<VerificationRecord | null>
  findActiveForAccount(orgId: string, accountId: string): Promise<VerificationListItem | null>
  list(
    orgId: string,
    params: ListVerificationsParams,
  ): Promise<{ items: VerificationListItem[]; nextCursor: string | null; hasMore: boolean }>
  transition(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    patch: VerificationPatch,
    history: HistoryEntry,
  ): Promise<VerificationRecord>
  addNote(ctx: MutationCtx, id: string, body: string): Promise<VerificationRecord>
  reviewDocument(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    input: ReviewDocumentInput,
  ): Promise<VerificationRecord>
  history(orgId: string, id: string): Promise<VerificationHistoryItem[]>
  markExpired(orgId: string): Promise<string[]>
}

async function load(tx: Prisma.TransactionClient, orgId: string, id: string) {
  const v = await tx.verification.findFirst({
    where: { id, organizationId: orgId },
    select: detailSelect,
  })
  if (!v) throw new NotFoundError('Verification not found.')
  return v
}

export const verificationRepository: VerificationRepository = {
  async create(ctx, input) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: input.accountId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!account) throw new NotFoundError('Account not found.')

      const created = await tx.verification.create({
        data: {
          organizationId: ctx.organizationId,
          accountId: input.accountId,
          supplierProfileId: input.supplierProfileId,
          requiredDocumentTypes: input.requiredDocumentTypes,
          status: 'DRAFT',
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
          history: {
            create: { toStatus: 'DRAFT', action: 'verification.created', actorId: ctx.actorId },
          },
        },
        select: detailSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Verification',
        entityId: created.id,
        action: 'verification.created',
        after: created,
      })
      return created
    })
  },

  findById(orgId, id) {
    return prisma.verification.findFirst({
      where: { id, organizationId: orgId },
      select: detailSelect,
    })
  },

  findActiveForAccount(orgId, accountId) {
    return prisma.verification.findFirst({
      where: { organizationId: orgId, accountId, status: { in: OCCUPYING } },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    })
  },

  async list(orgId, params) {
    const desc = !params.sort || params.sort.startsWith('-')
    const rawField = params.sort?.replace(/^-/, '') ?? 'createdAt'
    const field = SORTABLE.has(rawField) ? rawField : 'createdAt'
    const dir: Prisma.SortOrder = desc ? 'desc' : 'asc'
    const where: Prisma.VerificationWhereInput = {
      organizationId: orgId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.reviewerId ? { reviewerId: params.reviewerId } : {}),
    }
    const cursorId = params.cursor ? decodeCursor(params.cursor) : undefined
    const rows = await prisma.verification.findMany({
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

  async transition(ctx, id, expectedVersion, patch, history) {
    return prisma.$transaction(async (tx) => {
      const before = await load(tx, ctx.organizationId, id)
      const res = await tx.verification.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { ...patch, updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      await tx.verificationHistory.create({
        data: {
          verificationId: id,
          fromStatus: history.fromStatus,
          toStatus: history.toStatus,
          action: history.action,
          actorId: ctx.actorId,
          reason: history.reason,
        },
      })
      const after = await tx.verification.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Verification',
        entityId: id,
        action: history.action,
        before,
        after,
      })
      return after
    })
  },

  async addNote(ctx, id, body) {
    return prisma.$transaction(async (tx) => {
      await load(tx, ctx.organizationId, id)
      await tx.verificationNote.create({
        data: { verificationId: id, authorId: ctx.actorId, body },
      })
      const after = await tx.verification.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Verification',
        entityId: id,
        action: 'verification.note_added',
        after,
      })
      return after
    })
  },

  async reviewDocument(ctx, id, expectedVersion, input) {
    return prisma.$transaction(async (tx) => {
      const before = await load(tx, ctx.organizationId, id)
      const res = await tx.verification.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      await tx.verificationReview.upsert({
        where: { verificationId_documentId: { verificationId: id, documentId: input.documentId } },
        create: {
          verificationId: id,
          documentId: input.documentId,
          documentType: input.documentType,
          status: input.status,
          note: input.note,
          reviewedById: ctx.actorId,
          reviewedAt: new Date(),
        },
        update: {
          status: input.status,
          note: input.note,
          reviewedById: ctx.actorId,
          reviewedAt: new Date(),
        },
      })
      const after = await tx.verification.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Verification',
        entityId: id,
        action: 'verification.document_reviewed',
        before,
        after,
      })
      return after
    })
  },

  history(orgId, id) {
    return prisma.verificationHistory.findMany({
      where: { verificationId: id, verification: { organizationId: orgId } },
      select: historySelect,
      orderBy: { createdAt: 'asc' },
    })
  },

  async markExpired(orgId) {
    const now = new Date()
    const due = await prisma.verification.findMany({
      where: { organizationId: orgId, status: 'VERIFIED', expiresAt: { lt: now } },
      select: { id: true, version: true },
    })
    for (const v of due) {
      await prisma.verification.update({
        where: { id: v.id },
        data: {
          status: 'EXPIRED',
          version: { increment: 1 },
          history: {
            create: {
              fromStatus: 'VERIFIED',
              toStatus: 'EXPIRED',
              action: 'verification.expired',
              actorId: 'system',
            },
          },
        },
      })
    }
    return due.map((v) => v.id)
  },
}
