import { createDocumentSchema, listDocumentsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { documentService } from '@/lib/document-service'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listDocumentsQuerySchema)
    const result = await documentService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor, hasMore: result.hasMore },
      },
    })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, createDocumentSchema)
    const doc = await documentService.create({ ...auth, requestId }, dto)
    return ok(doc, { requestId, status: 201, etag: etag(doc.version) })
  })
}
