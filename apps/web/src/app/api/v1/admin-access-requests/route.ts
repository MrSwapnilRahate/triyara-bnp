import {
  createAdminAccessRequestSchema,
  listAdminAccessRequestsQuerySchema,
} from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminAccessRequestService } from '@/lib/admin-access-request-service'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { emailService } from '@/lib/email'

// GET /api/v1/admin-access-requests - the decision queue.
// Super Admin only, checked in the service by email against centralized
// configuration. Holding ADMIN is not sufficient.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listAdminAccessRequestsQuerySchema)
    const result = await adminAccessRequestService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: { status: query.status ?? null, q: query.q ?? null },
        sort: query.sort ?? '-createdAt',
      },
    })
  })
}

// POST /api/v1/admin-access-requests - asks for administrator access.
//
// Any signed-in non-admin may ask. The requester is taken from the session and
// never from the body: a client that could name the requester could ask on
// somebody else's behalf.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, createAdminAccessRequestSchema)
    const request = await adminAccessRequestService.request({ ...auth, requestId }, dto)

    // Best-effort, like every other send: the request is already recorded, and
    // failing here would lose it over an email problem. The outcome is
    // reported back rather than swallowed.
    const delivery = await emailService.adminAccessRequested({
      requesterName: request.requesterName,
      requesterEmail: request.requesterEmail,
      organizationName: auth.organizationId,
      currentRole: request.currentRole,
      reason: request.reason,
      requestedAt: request.createdAt,
      requestId: request.id,
    })

    return ok(request, {
      requestId,
      status: 201,
      etag: etag(request.version),
      meta: { notificationEmail: delivery.status },
    })
  })
}
