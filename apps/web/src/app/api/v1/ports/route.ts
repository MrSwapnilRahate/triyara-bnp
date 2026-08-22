import { listPortsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { logisticsReferenceService } from '@/lib/freight-service'

// GET /api/v1/ports - global reference data, read by every signed-in role.
// There is no organization scope here on purpose: a port is a fact, not a
// tenant's record.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listPortsQuerySchema)
    const ports = await logisticsReferenceService.listPorts({ ...auth, requestId }, query)
    return ok(ports, { requestId })
  })
}
