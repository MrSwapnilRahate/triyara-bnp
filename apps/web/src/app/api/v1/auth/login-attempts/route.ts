import { listLoginAttemptsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { loginAuditService } from '@/lib/auth-extension-service'

// GET /api/v1/auth/login-attempts -> authentication audit trail (ADMIN only)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listLoginAttemptsQuerySchema)
    const result = await loginAuditService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: { pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}
