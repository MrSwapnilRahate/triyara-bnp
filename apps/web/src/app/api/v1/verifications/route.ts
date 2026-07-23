import { createVerificationSchema, listVerificationsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { verificationService } from '@/lib/verification-service'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listVerificationsQuerySchema)
    const result = await verificationService.list({ ...auth, requestId }, query)
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
    const dto = await parseBody(req, createVerificationSchema)
    const v = await verificationService.create({ ...auth, requestId }, dto)
    return ok(v, { requestId, status: 201, etag: etag(v.version) })
  })
}
