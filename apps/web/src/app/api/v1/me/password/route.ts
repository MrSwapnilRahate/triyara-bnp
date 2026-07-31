import { changePasswordSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminService } from '@/lib/admin-service'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'

// POST /api/v1/me/password - change the caller's own password.
//
// The current password must be supplied and is verified before the change, so a
// hijacked session cannot lock the real owner out of their own account. That is
// why this is a distinct endpoint rather than a field on PATCH /me: the rest of
// the profile carries no such requirement.
//
// Returns no body. A password endpoint should not echo anything about the
// credential it just accepted.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, changePasswordSchema)
    await adminService.changePassword({ ...auth, requestId }, dto)
    return ok(null, { requestId })
  })
}
