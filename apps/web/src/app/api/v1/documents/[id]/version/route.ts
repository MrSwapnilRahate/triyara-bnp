import { createDocumentVersionSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { documentService } from '@/lib/document-service'

type Params = { params: Promise<{ id: string }> }

export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, createDocumentVersionSchema)
    const doc = await documentService.addVersion({ ...auth, requestId }, id, dto, version)
    return ok(doc, { requestId, status: 201, etag: etag(doc.version) })
  })
}
