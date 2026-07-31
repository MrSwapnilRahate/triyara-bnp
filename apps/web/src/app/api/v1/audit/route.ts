import { listAuditQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminService } from '@/lib/admin-service'
import { ok, parseQuery, route } from '@/lib/api'

// GET /api/v1/audit - the tenant's audit trail, newest first.
//
// Read-only, and there is no companion write route by design: rows are written
// by the repositories inside the same transaction as the change they describe.
// A trail an operator can append to or edit is not a trail.
//
// Authorization is `manage Organization` - ADMIN only. The trail carries
// before/after payloads for every entity in the tenant, so it is strictly more
// revealing than any single module's read permission, and gating it at read
// level would leak through it.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listAuditQuerySchema)
    const result = await adminService.listAudit({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          entityType: query.entityType ?? null,
          entityId: query.entityId ?? null,
          actorId: query.actorId ?? null,
          action: query.action ?? null,
          requestId: query.requestId ?? null,
          q: query.q ?? null,
        },
      },
    })
  })
}
