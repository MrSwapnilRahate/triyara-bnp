import { updateSupplierContactSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { supplierContactService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string; contactId: string }> }

// PATCH /api/suppliers/:id/contacts/:contactId - edit a contact.
//
// Requires If-Match. Two people editing the same contact from two chats is the
// ordinary case here, not the exotic one, so the second writer is told rather
// than silently overwriting the first.
//
// Setting `isPrimary: true` demotes the supplier's other contacts inside the
// same transaction - "primary" is a property of the set.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, contactId } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateSupplierContactSchema)
    const contact = await supplierContactService.update(
      { ...auth, requestId },
      id,
      contactId,
      expectedVersion,
      dto,
    )
    return ok(contact, { requestId, etag: etag(contact.version) })
  })
}

// DELETE /api/suppliers/:id/contacts/:contactId - soft delete, requires If-Match.
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, contactId } = await params
    const expectedVersion = requireIfMatch(req)
    const contact = await supplierContactService.remove(
      { ...auth, requestId },
      id,
      contactId,
      expectedVersion,
    )
    return ok(contact, { requestId, etag: etag(contact.version) })
  })
}
