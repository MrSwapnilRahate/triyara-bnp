import { supplierContactSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, route } from '@/lib/api'
import { supplierContactService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/contacts - the people at this supplier.
//
// Not paginated: a supplier has a handful of contacts, and a cursor over five
// rows costs more to use than it saves. Primary first, so the person to ring is
// the first row.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const contacts = await supplierContactService.list({ ...auth, requestId }, id)
    return ok(contacts, { requestId, meta: { supplierId: id, count: contacts.length } })
  })
}

// POST /api/suppliers/:id/contacts - add a contact (ADMIN, EXPORT_MANAGER).
//
// No If-Match: this creates a row rather than replacing one, so there is no
// version to be stale against. The mutations on :contactId do require it.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, supplierContactSchema)
    const contact = await supplierContactService.add({ ...auth, requestId }, id, dto)
    return ok(contact, { requestId, status: 201, etag: etag(contact.version) })
  })
}
