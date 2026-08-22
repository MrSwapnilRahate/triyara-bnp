import { listContainerTypesQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { logisticsReferenceService } from '@/lib/freight-service'

// GET /api/v1/container-types - global reference data. See /api/v1/ports.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listContainerTypesQuerySchema)
    const types = await logisticsReferenceService.listContainerTypes({ ...auth, requestId }, query)
    return ok(types, { requestId })
  })
}
