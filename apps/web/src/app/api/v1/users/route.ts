import { listUsersQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminService } from '@/lib/admin-service'
import { ok, parseQuery, route } from '@/lib/api'

// GET /api/v1/users - colleague lookup for global search.
//
// Deliberately narrow: id, name, email and avatar, and only ACTIVE users in the
// caller's own organization. A directory lookup must not become a way to read
// anything else about a colleague, so the projection is fixed rather than
// parameterised, and there is no detail route to follow.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listUsersQuerySchema)
    const users = await adminService.searchUsers({ ...auth, requestId }, query)
    return ok(users, { requestId, meta: { count: users.length, q: query.q ?? null } })
  })
}
