import { updateOrganizationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminService } from '@/lib/admin-service'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'

// GET   /api/v1/organization - the caller's tenant.
// PATCH /api/v1/organization - rename it. ADMIN only (`manage Organization`).
//
// Always the caller's OWN organization, resolved from the session - there is no
// id parameter, so this cannot be aimed at another tenant.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const organization = await adminService.getOrganization({ ...auth, requestId })
    return ok(organization, { requestId })
  })
}

export function PATCH(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, updateOrganizationSchema)
    const organization = await adminService.updateOrganization({ ...auth, requestId }, dto)
    return ok(organization, { requestId })
  })
}
