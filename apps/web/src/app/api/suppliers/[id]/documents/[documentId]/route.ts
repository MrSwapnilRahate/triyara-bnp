import { updateSupplierDocumentSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { supplierDocumentService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string; documentId: string }> }

// PATCH /api/suppliers/:id/documents/:documentId
//
// Corrects metadata, or replaces the file when a new `storageKey` is given -
// the row keeps its identity, which is what "they sent a newer catalogue"
// means. Requires If-Match.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, documentId } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateSupplierDocumentSchema)
    const document = await supplierDocumentService.update(
      { ...auth, requestId },
      id,
      documentId,
      expectedVersion,
      dto,
    )
    return ok(document, { requestId, etag: etag(document.version) })
  })
}

// DELETE /api/suppliers/:id/documents/:documentId - soft delete.
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, documentId } = await params
    const expectedVersion = requireIfMatch(req)
    const document = await supplierDocumentService.remove(
      { ...auth, requestId },
      id,
      documentId,
      expectedVersion,
    )
    return ok(document, { requestId, etag: etag(document.version) })
  })
}
