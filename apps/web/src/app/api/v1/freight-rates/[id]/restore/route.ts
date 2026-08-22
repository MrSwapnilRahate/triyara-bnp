import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { freightRateService } from '@/lib/freight-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/v1/freight-rates/:id/restore
//
// Authorized on `update`, matching every other restore in the platform. A
// restore can collide with a rate recorded since the delete, which the overlap
// constraint refuses as a 409 rather than silently double-covering a corridor.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const rate = await freightRateService.restore({ ...auth, requestId }, id, expectedVersion)
    return ok(rate, { requestId, etag: etag(rate.version) })
  })
}
