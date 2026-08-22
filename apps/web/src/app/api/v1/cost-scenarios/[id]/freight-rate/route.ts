import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { costScenarioService } from '@/lib/cost-scenario-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/v1/cost-scenarios/:id/freight-rate
//
// The rate that applies to this scenario, or a named reason none does. A
// separate resource rather than a field on the scenario because it is derived
// reference data, not part of the record - and because an unresolved lookup is
// an ordinary answer here, not a failure of the scenario read.
//
// READ-ONLY: nothing about this writes a charge (ADR-0012). Turning a rate into
// a cost stays an explicit decision.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const resolution = await costScenarioService.resolveFreight({ ...auth, requestId }, id)
    return ok(resolution, { requestId })
  })
}
