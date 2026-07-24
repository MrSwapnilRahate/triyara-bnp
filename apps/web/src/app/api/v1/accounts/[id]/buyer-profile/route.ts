import { createBuyerProfileSchema, updateBuyerProfileSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { buyerService } from '@/lib/buyer-service'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const profile = await buyerService.get({ ...auth, requestId }, id, { includeDeleted })
    return ok(profile, { requestId, etag: etag(profile.version) })
  })
}

export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, createBuyerProfileSchema)
    const profile = await buyerService.create({ ...auth, requestId }, id, dto)
    return ok(profile, { requestId, status: 201, etag: etag(profile.version) })
  })
}

export function PATCH(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, updateBuyerProfileSchema)
    const profile = await buyerService.update({ ...auth, requestId }, id, dto, version)
    return ok(profile, { requestId, etag: etag(profile.version) })
  })
}

export function DELETE(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const profile = await buyerService.remove({ ...auth, requestId }, id, version)
    return ok(profile, { requestId, etag: etag(profile.version) })
  })
}
