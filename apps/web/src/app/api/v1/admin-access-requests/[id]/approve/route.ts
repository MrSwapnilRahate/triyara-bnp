import { requireAuth } from '@/auth/context'
import { notifyAdminAccessDecision } from '@/lib/admin-access-notify'
import { adminAccessRequestService } from '@/lib/admin-access-request-service'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/v1/admin-access-requests/:id/approve
//
// Super Admin only. Grants ADMIN and marks the request approved in one
// transaction. Requires If-Match: two decisions racing must not both win.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)

    const result = await adminAccessRequestService.approve(
      { ...auth, requestId },
      id,
      expectedVersion,
    )
    const delivery = await notifyAdminAccessDecision(result, 'approved')

    return ok(result.request, {
      requestId,
      etag: etag(result.request.version),
      meta: { status: result.request.status, decisionEmail: delivery },
    })
  })
}
