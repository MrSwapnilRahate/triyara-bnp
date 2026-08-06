import { listSupplierNotesQuerySchema, supplierNoteSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { supplierNoteService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/notes - the CRM timeline, newest first, cursor-paged.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const query = parseQuery(new URL(req.url).searchParams, listSupplierNotesQuerySchema)
    const result = await supplierNoteService.list({ ...auth, requestId }, id, query)
    return ok(result.items, {
      requestId,
      meta: {
        supplierId: id,
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: { source: query.source ?? null, authorId: query.authorId ?? null },
      },
    })
  })
}

// POST /api/suppliers/:id/notes - record a conversation (ADMIN, EXPORT_MANAGER)
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, supplierNoteSchema)
    const note = await supplierNoteService.add({ ...auth, requestId }, id, dto)
    return ok(note, { requestId, status: 201, etag: etag(note.version) })
  })
}
