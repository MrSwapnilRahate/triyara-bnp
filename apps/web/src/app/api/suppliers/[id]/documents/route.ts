import { supplierDocumentSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, route } from '@/lib/api'
import { supplierDocumentService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/documents - the paperwork this supplier has sent.
//
// Not paginated: a supplier has a handful of documents, and a cursor over five
// rows costs more to use than it saves. Newest first, because the file someone
// just sent is the one they are looking for.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const documents = await supplierDocumentService.list({ ...auth, requestId }, id)
    return ok(documents, { requestId, meta: { supplierId: id, count: documents.length } })
  })
}

// POST /api/suppliers/:id/documents - record a file already uploaded.
//
// Step two of the two-step upload; the bytes went straight to storage via the
// presigned URL. The service verifies the object exists before writing a row,
// so the list never shows a file that cannot be opened.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, supplierDocumentSchema)
    const document = await supplierDocumentService.add({ ...auth, requestId }, id, dto)
    return ok(document, { requestId, status: 201, etag: etag(document.version) })
  })
}
