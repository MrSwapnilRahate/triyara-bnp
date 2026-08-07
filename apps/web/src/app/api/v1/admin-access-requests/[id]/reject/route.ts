import { rejectAdminAccessRequestSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { notifyAdminAccessDecision } from '@/lib/admin-access-notify'
import { adminAccessRequestService } from '@/lib/admin-access-request-service'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/v1/admin-access-requests/:id/reject
//
// Super Admin only. The reason is mandatory - a refusal with no grounds is
// unusable to the person who receives it and to anyone auditing it later.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, rejectAdminAccessRequestSchema)

    const result = await adminAccessRequestService.reject(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    const delivery = await notifyAdminAccessDecision(result, 'rejected')

    return ok(result.request, {
      requestId,
      etag: etag(result.request.version),
      meta: { status: result.request.status, decisionEmail: delivery },
    })
  })
}
