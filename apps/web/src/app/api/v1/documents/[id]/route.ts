import { updateDocumentSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { documentService } from '@/lib/document-service'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const doc = await documentService.get({ ...auth, requestId }, id, { includeDeleted })
    return ok(doc, { requestId, etag: etag(doc.version) })
  })
}

export function PATCH(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, updateDocumentSchema)
    const doc = await documentService.update({ ...auth, requestId }, id, dto, version)
    return ok(doc, { requestId, etag: etag(doc.version) })
  })
}

export function DELETE(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const doc = await documentService.remove({ ...auth, requestId }, id, version)
    return ok(doc, { requestId, etag: etag(doc.version) })
  })
}
