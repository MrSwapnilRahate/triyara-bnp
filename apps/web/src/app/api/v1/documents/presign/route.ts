import { presignDocumentSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { documentService } from '@/lib/document-service'

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, presignDocumentSchema)
    const presigned = await documentService.presign({ ...auth, requestId }, dto)
    return ok(presigned, { requestId })
  })
}
