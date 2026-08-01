import { listAdminUsersQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminUsersService } from '@/lib/admin-users-service'
import { ok, parseQuery, route } from '@/lib/api'

// GET /api/v1/admin/users - the tenant's people, for administering them.
//
// Distinct from GET /api/v1/users, which is unchanged. That one is a directory
// lookup behind global search: active users only, four fields, no paging, open
// to any signed-in role. This one carries status, roles and last sign-in, pages
// with a keyset cursor, and requires `manage User` - which, given ADMIN holds
// `manage all` and every other role holds only `read all`, is ADMIN alone.
//
// Read-only. Changing who someone is, or what they may do, already has its own
// endpoints under /api/v1/auth/role-assignments and is not duplicated here.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listAdminUsersQuerySchema)
    const result = await adminUsersService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          q: query.q ?? null,
          status: query.status ?? null,
          role: query.role ?? null,
        },
        sort: query.sort ?? '-createdAt',
      },
    })
  })
}
