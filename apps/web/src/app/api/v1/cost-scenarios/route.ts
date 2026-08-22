import { createCostScenarioSchema, listCostScenariosQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { costScenarioService } from '@/lib/cost-scenario-service'

// GET  /api/v1/cost-scenarios  -> list the tenant's scenarios
// POST /api/v1/cost-scenarios  -> create one
//
// Money crosses this boundary as a STRING in both directions (ADR-0012); a JSON
// number would already have lost precision by the time it arrived.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listCostScenariosQuerySchema)
    const result = await costScenarioService.list({ ...auth, requestId }, query)
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
    const dto = await parseBody(req, createCostScenarioSchema)
    const scenario = await costScenarioService.create({ ...auth, requestId }, dto)
    return ok(scenario, { requestId, status: 201, etag: etag(scenario.version) })
  })
}
