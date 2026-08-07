import { revokeAdminAccessSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { notifyAdminAccessDecision } from '@/lib/admin-access-notify'
import { adminAccessRequestService } from '@/lib/admin-access-request-service'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/v1/admin-access-requests/:id/revoke
//
// Super Admin only. No other ADMIN may revoke an ADMIN - one who could would
// be able to remove everyone who disagreed with them. Removes the role and
// marks the request in one transaction; the reason is mandatory because the
// person is told why.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, revokeAdminAccessSchema)

    const result = await adminAccessRequestService.revoke(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    const delivery = await notifyAdminAccessDecision(result, 'revoked')

    return ok(result.request, {
      requestId,
      etag: etag(result.request.version),
      meta: { status: result.request.status, decisionEmail: delivery },
    })
  })
}
