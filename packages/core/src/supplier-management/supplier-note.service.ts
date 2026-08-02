import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  NoteListResult,
  NoteRecord,
  SupplierNoteRepository,
  UpdateNoteData,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError } from '@triyara/lib'
import type {
  ListSupplierNotesQuery,
  SupplierNoteDto,
  UpdateSupplierNoteDto,
} from '@triyara/validation'

// Supplier notes - the CRM timeline (TRY-BNP-SUPPLIER-02).
//
// Notes are gated on SupplierProfile rather than on a subject of their own:
// a note is commercially sensitive in exactly the way the supplier record is,
// and anyone who may not read the supplier must not read what it said.

export type NoteServiceCtx = AuthContext & { requestId?: string }

export interface NoteServiceDeps {
  repo: SupplierNoteRepository
  events: EventBus
}

function mutationCtx(ctx: NoteServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createSupplierNoteService({ repo, events }: NoteServiceDeps) {
  return {
    async list(
      ctx: NoteServiceCtx,
      supplierId: string,
      query: ListSupplierNotesQuery,
    ): Promise<NoteListResult> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      // Visibility first: an unreadable supplier must look empty of notes in
      // the same way it looks absent, never like a supplier with zero notes.
      await repo.assertVisible(ctx.organizationId, supplierId)
      return repo.list({
        organizationId: ctx.organizationId,
        supplierId,
        source: query.source,
        authorId: query.authorId,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async add(ctx: NoteServiceCtx, supplierId: string, dto: SupplierNoteDto): Promise<NoteRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const note = await repo.create(mutationCtx(ctx), supplierId, {
        body: dto.body,
        ...(dto.source ? { source: dto.source } : {}),
      })
      await events.emit(
        makeEvent({
          type: 'supplier.note_added',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, noteId: note.id, source: note.source },
        }),
      )
      return note
    },

    async update(
      ctx: NoteServiceCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
      dto: UpdateSupplierNoteDto,
    ): Promise<NoteRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      await repo.assertVisible(ctx.organizationId, supplierId)

      const existing = await repo.findById(ctx.organizationId, id)
      // A note reached through the wrong supplier is not found, not forbidden:
      // the path has to be a real path, or note ids become guessable across
      // suppliers within a tenant.
      if (!existing || existing.supplierId !== supplierId)
        throw new NotFoundError('Note not found.')

      const note = await repo.mutate(mutationCtx(ctx), id, expectedVersion, dto as UpdateNoteData)
      await events.emit(
        makeEvent({
          type: 'supplier.note_updated',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, noteId: note.id },
        }),
      )
      return note
    },

    async remove(
      ctx: NoteServiceCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
    ): Promise<NoteRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      await repo.assertVisible(ctx.organizationId, supplierId)

      const existing = await repo.findById(ctx.organizationId, id)
      if (!existing || existing.supplierId !== supplierId)
        throw new NotFoundError('Note not found.')

      const note = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await events.emit(
        makeEvent({
          type: 'supplier.note_removed',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, noteId: note.id },
        }),
      )
      return note
    },
  }
}

export type SupplierNoteService = ReturnType<typeof createSupplierNoteService>
