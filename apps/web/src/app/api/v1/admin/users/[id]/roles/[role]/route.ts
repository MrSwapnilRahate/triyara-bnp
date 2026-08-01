import { assignableRoleSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, route } from '@/lib/api'
import { userRoleService } from '@/lib/auth-extension-service'

// DELETE /api/v1/admin/users/:id/roles/:role -> revoke a base role (ADMIN).
//
// The role is a path segment rather than a body, because the membership it
// names IS the resource being deleted. It is validated against the same
// vocabulary the grant endpoint uses, so an unknown name is a 422 rather than a
// silent no-op.
//
// Two refusals, both 409: an administrator cannot remove their own role, and
// the organization cannot lose its last administrator.
export function DELETE(req: Request, ctx: { params: Promise<{ id: string; role: string }> }) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, role } = await ctx.params
    const parsed = assignableRoleSchema.parse(decodeURIComponent(role))
    const roles = await userRoleService.revoke({ ...auth, requestId }, id, parsed)
    return ok(roles, { requestId, meta: { userId: id, count: roles.length } })
  })
}
