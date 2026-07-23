import { updateVerificationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { verificationService } from '@/lib/verification-service'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const v = await verificationService.get({ ...auth, requestId }, id)
    return ok(v, { requestId, etag: etag(v.version) })
  })
}

export function PATCH(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, updateVerificationSchema)
    const v = await verificationService.update({ ...auth, requestId }, id, dto, version)
    return ok(v, { requestId, etag: etag(v.version) })
  })
}
