import { updateSupplierNoteSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { supplierNoteService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string; noteId: string }> }

// PATCH /api/suppliers/:id/notes/:noteId - revise a note (ADMIN, EXPORT_MANAGER)
//
// If-Match is required, not optional: two people summarising the same call is
// the ordinary case here, and a silent last-write-wins would quietly discard
// the terms one of them recorded.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, noteId } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateSupplierNoteSchema)
    const note = await supplierNoteService.update(
      { ...auth, requestId },
      id,
      noteId,
      expectedVersion,
      dto,
    )
    return ok(note, { requestId, etag: etag(note.version) })
  })
}

// DELETE /api/suppliers/:id/notes/:noteId - soft delete (ADMIN, EXPORT_MANAGER)
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, noteId } = await params
    const expectedVersion = requireIfMatch(req)
    const note = await supplierNoteService.remove(
      { ...auth, requestId },
      id,
      noteId,
      expectedVersion,
    )
    return ok({ id: note.id, deletedAt: note.deletedAt }, { requestId })
  })
}
