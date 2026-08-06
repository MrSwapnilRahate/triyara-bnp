import type { Prisma, SupplierNoteSource } from '@prisma/client'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Supplier notes - the CRM timeline (TRY-BNP-SUPPLIER-02). The running record
// of what a supplier said, on which channel, and who heard it. This is the
// table that replaces "scroll back through WhatsApp".

const noteSelect = {
  id: true,
  supplierId: true,
  organizationId: true,
  authorId: true,
  body: true,
  source: true,
  editedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.SupplierNoteSelect

type NoteRow = Prisma.SupplierNoteGetPayload<{ select: typeof noteSelect }>

/** Author identity, resolved separately because `authorId` carries no FK. */
export interface NoteAuthor {
  id: string
  name: string
  email: string
}

export type NoteRecord = NoteRow & { author: NoteAuthor | null }

export interface CreateNoteData {
  body: string
  source?: SupplierNoteSource
}

export interface UpdateNoteData {
  body?: string
  source?: SupplierNoteSource | null
}

export interface ListNotesParams {
  organizationId: string
  supplierId: string
  source?: SupplierNoteSource
  authorId?: string
  limit: number
  cursor?: string
}

export interface NoteListResult {
  items: NoteRecord[]
  nextCursor: string | null
}

/**
 * Attaches author identity to rows in one extra query rather than N.
 *
 * A missing user is rendered as `null`, not as an error: the note is the record
 * of record and has to survive the departure of whoever wrote it.
 */
async function withAuthors(rows: NoteRow[]): Promise<NoteRecord[]> {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.map((r) => r.authorId))]
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  })
  const byId = new Map(users.map((u) => [u.id, u]))
  return rows.map((row) => ({ ...row, author: byId.get(row.authorId) ?? null }))
}

/** Bounds what a free-text body contributes to an audit row. */
function preview(body: string): string {
  return body.length > 200 ? `${body.slice(0, 200)}…` : body
}

export const supplierNoteRepository = {
  /**
   * Confirms the supplier is visible to this organization.
   *
   * Public because callers must establish visibility BEFORE acting on a note:
   * otherwise the shape of the failure tells an outsider whether a supplier
   * exists under another tenant, which is exactly what the 404 is for.
   */
  async assertVisible(organizationId: string, supplierId: string): Promise<void> {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!supplier) throw new NotFoundError('Supplier not found.')
  },

  async list(params: ListNotesParams): Promise<NoteListResult> {
    const where: Prisma.SupplierNoteWhereInput = {
      organizationId: params.organizationId,
      supplierId: params.supplierId,
      deletedAt: null,
      ...(params.source ? { source: params.source } : {}),
      ...(params.authorId ? { authorId: params.authorId } : {}),
    }

    const rows = await prisma.supplierNote.findMany({
      where,
      select: noteSelect,
      // Newest first: a timeline is read from the top, and the most recent
      // conversation is the one that decides what to do next.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const page = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(page[page.length - 1]!.id) : null
    return { items: await withAuthors(page), nextCursor }
  },

  async findById(organizationId: string, id: string): Promise<NoteRecord | null> {
    const row = await prisma.supplierNote.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: noteSelect,
    })
    if (!row) return null
    return (await withAuthors([row]))[0]!
  },

  async create(ctx: MutationCtx, supplierId: string, data: CreateNoteData): Promise<NoteRecord> {
    const row = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!supplier) throw new NotFoundError('Supplier not found.')

      const note = await tx.supplierNote.create({
        data: {
          supplierId,
          organizationId: ctx.organizationId,
          authorId: ctx.actorId,
          body: data.body,
          ...(data.source ? { source: data.source } : {}),
        },
        select: noteSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: supplierId,
        action: 'supplier.note_added',
        after: { noteId: note.id, source: note.source, body: preview(note.body) },
      })

      return note
    })
    return (await withAuthors([row]))[0]!
  },

  async mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateNoteData,
  ): Promise<NoteRecord> {
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.supplierNote.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: noteSelect,
      })
      if (!before) throw new NotFoundError('Note not found.')

      // `editedAt` marks a changed body only. Re-tagging the channel is a
      // correction of metadata, not a revision of what was said.
      const bodyChanged = data.body !== undefined && data.body !== before.body

      const updated = await tx.supplierNote.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          ...(data.body === undefined ? {} : { body: data.body }),
          ...(data.source === undefined ? {} : { source: data.source }),
          ...(bodyChanged ? { editedAt: new Date() } : {}),
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplierNote.findUniqueOrThrow({ where: { id }, select: noteSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: after.supplierId,
        action: 'supplier.note_updated',
        before: { noteId: id, source: before.source, body: preview(before.body) },
        after: { noteId: id, source: after.source, body: preview(after.body) },
      })
      return after
    })
    return (await withAuthors([row]))[0]!
  },

  async softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<NoteRecord> {
    const row = await prisma.$transaction(async (tx) => {
      // Read first so a missing note is a 404 and only a stale version is a
      // 412. Collapsing both into "updated 0 rows" would report a note that
      // was never there as an edit conflict.
      const before = await tx.supplierNote.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, supplierId: true },
      })
      if (!before) throw new NotFoundError('Note not found.')

      const updated = await tx.supplierNote.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplierNote.findUniqueOrThrow({ where: { id }, select: noteSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: before.supplierId,
        action: 'supplier.note_removed',
        after: { noteId: id, deletedAt: after.deletedAt },
      })
      return after
    })
    return (await withAuthors([row]))[0]!
  },
}

export type SupplierNoteRepository = typeof supplierNoteRepository
