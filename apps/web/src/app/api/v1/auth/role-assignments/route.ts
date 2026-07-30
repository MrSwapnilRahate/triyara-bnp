import { grantScopedRoleSchema, listScopedRolesQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { scopedRoleService } from '@/lib/auth-extension-service'

// GET  /api/v1/auth/role-assignments -> list scoped grants
// POST /api/v1/auth/role-assignments -> grant a role on a resource (ADMIN)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listScopedRolesQuerySchema)
    const result = await scopedRoleService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: { pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, grantScopedRoleSchema)
    const assignment = await scopedRoleService.grant({ ...auth, requestId }, dto)
    return ok(assignment, { requestId, status: 201, etag: etag(assignment.version) })
  })
}
