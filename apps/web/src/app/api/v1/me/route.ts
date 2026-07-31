import { updateProfileSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminService } from '@/lib/admin-service'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'

// GET   /api/v1/me - the signed-in user's own profile.
// PATCH /api/v1/me - change their display name.
//
// No ability check beyond authentication, because there is nothing to gate:
// both read and write resolve the user from the session, so a caller cannot
// point either at somebody else. Email is the login identifier and roles are
// granted by an administrator, so the schema accepts neither.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const profile = await adminService.getProfile({ ...auth, requestId })
    return ok(profile, { requestId })
  })
}

export function PATCH(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, updateProfileSchema)
    const profile = await adminService.updateProfile({ ...auth, requestId }, dto)
    return ok(profile, { requestId })
  })
}
