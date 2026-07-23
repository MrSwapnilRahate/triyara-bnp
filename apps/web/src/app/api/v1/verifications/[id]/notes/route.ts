import { addVerificationNoteSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, route } from '@/lib/api'
import { verificationService } from '@/lib/verification-service'

type Params = { params: Promise<{ id: string }> }

export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, addVerificationNoteSchema)
    const v = await verificationService.addNote({ ...auth, requestId }, id, dto)
    return ok(v, { requestId, status: 201, etag: etag(v.version) })
  })
}
