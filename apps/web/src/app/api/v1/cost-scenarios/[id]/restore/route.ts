import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { costScenarioService } from '@/lib/cost-scenario-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/v1/cost-scenarios/:id/restore
//
// Undoes a soft delete. Authorized on `update`, matching RFQ, Supplier, Product
// and Category - putting a record back is an edit. Sends If-Match with the
// deleted record's version, so a stale tab cannot resurrect something another
// user has since changed.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const scenario = await costScenarioService.restore({ ...auth, requestId }, id, expectedVersion)
    return ok(scenario, { requestId, etag: etag(scenario.version) })
  })
}
