import { assignBaseRoleSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { userRoleService } from '@/lib/auth-extension-service'

// GET  /api/v1/admin/users/:id/roles -> the base roles this user holds
// POST /api/v1/admin/users/:id/roles -> grant one
//
// These are the roles the session is built from and CASL derives ability from,
// as distinct from /api/v1/auth/role-assignments, which grants a role on a
// single resource. Both require ADMIN; this one is gated on `manage User`.
//
// No If-Match. A membership is a set element with a composite primary key, not
// a versioned document: a duplicate grant is refused by the key itself, and the
// hazard worth guarding - losing the last administrator - is handled with a row
// lock in the repository rather than with an ETag the caller could ignore.

export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(_req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await ctx.params
    const roles = await userRoleService.list({ ...auth, requestId }, id)
    return ok(roles, { requestId, meta: { userId: id, count: roles.length } })
  })
}

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await ctx.params
    const dto = await parseBody(req, assignBaseRoleSchema)
    const roles = await userRoleService.assign({ ...auth, requestId }, id, dto.role)
    return ok(roles, { requestId, status: 201, meta: { userId: id, count: roles.length } })
  })
}
