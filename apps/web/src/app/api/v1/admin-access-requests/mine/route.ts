import { requireAuth } from '@/auth/context'
import { adminAccessRequestService } from '@/lib/admin-access-request-service'
import { ok, route } from '@/lib/api'

// GET /api/v1/admin-access-requests/mine - the caller's own latest request.
//
// Drives what the person sees: a pending notice, a rejection, or the banner
// telling them their access was withdrawn. Not gated beyond authentication -
// it is their own record, scoped to their user id in the repository.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const request = await adminAccessRequestService.myLatest({ ...auth, requestId })
    return ok(request, { requestId })
  })
}
