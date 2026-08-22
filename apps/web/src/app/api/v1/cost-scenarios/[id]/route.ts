import { updateCostScenarioSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { costScenarioService } from '@/lib/cost-scenario-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/v1/cost-scenarios/:id
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const scenario = await costScenarioService.get({ ...auth, requestId }, id, { includeDeleted })
    return ok(scenario, { requestId, etag: etag(scenario.version) })
  })
}

// PATCH /api/v1/cost-scenarios/:id - requires If-Match.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateCostScenarioSchema)
    const scenario = await costScenarioService.update(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(scenario, { requestId, etag: etag(scenario.version) })
  })
}

// DELETE /api/v1/cost-scenarios/:id - soft delete, requires If-Match. A scenario
// is a working document, so an export manager may discard their own.
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const scenario = await costScenarioService.remove({ ...auth, requestId }, id, expectedVersion)
    return ok(scenario, { requestId, etag: etag(scenario.version) })
  })
}
