import { roleScopeTypeSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { permissionService } from '@/lib/auth-extension-service'

// GET /api/v1/auth/permissions
//   ?scopeType=&scopeId=  -> effective permissions including live scoped grants
//
// Permissions are DERIVED from CASL at read time, never stored, so this can
// never disagree with what the guards actually enforce.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const sp = new URL(req.url).searchParams
    const scopeType = sp.get('scopeType')
    const scopeId = sp.get('scopeId')
    const userId = sp.get('userId') ?? undefined

    if (scopeType && scopeId) {
      const parsed = roleScopeTypeSchema.parse(scopeType)
      const matrix = await permissionService.forScope(
        { ...auth, requestId },
        { userId, scopeType: parsed, scopeId },
      )
      return ok(matrix, { requestId })
    }

    return ok(permissionService.mine({ ...auth, requestId }), { requestId })
  })
}
