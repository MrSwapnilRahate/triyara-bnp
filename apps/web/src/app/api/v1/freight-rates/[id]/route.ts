import { updateFreightRateSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { freightRateService } from '@/lib/freight-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const rate = await freightRateService.get({ ...auth, requestId }, id, { includeDeleted })
    return ok(rate, { requestId, etag: etag(rate.version) })
  })
}

// PATCH - requires If-Match. Coherence is judged against the merged record, so
// changing only the mode still has to suit the container already stored.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateFreightRateSchema)
    const rate = await freightRateService.update({ ...auth, requestId }, id, expectedVersion, dto)
    return ok(rate, { requestId, etag: etag(rate.version) })
  })
}

// DELETE - soft delete, requires If-Match.
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const rate = await freightRateService.remove({ ...auth, requestId }, id, expectedVersion)
    return ok(rate, { requestId, etag: etag(rate.version) })
  })
}
