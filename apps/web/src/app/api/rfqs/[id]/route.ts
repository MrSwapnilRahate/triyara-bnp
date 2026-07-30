import { updateRfqSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/rfqs/:id
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const rfq = await rfqService.get({ ...auth, requestId }, id)
    return ok(rfq, { requestId, etag: etag(rfq.version) })
  })
}

// PATCH /api/rfqs/:id - requires If-Match. Commercial terms freeze once ISSUED;
// that rule lives in the service, not here.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateRfqSchema)
    const rfq = await rfqService.update({ ...auth, requestId }, id, expectedVersion, dto)
    return ok(rfq, { requestId, etag: etag(rfq.version) })
  })
}

// DELETE /api/rfqs/:id - soft delete, requires If-Match
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const rfq = await rfqService.remove({ ...auth, requestId }, id, expectedVersion)
    return ok(rfq, { requestId, etag: etag(rfq.version) })
  })
}
