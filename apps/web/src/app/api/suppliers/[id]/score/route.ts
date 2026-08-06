import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { supplierMatchingService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/score - readiness score with its reasons
//
// Returns the component breakdown, not just a number. A score nobody can
// interrogate is a number people stop trusting the first time it disagrees
// with them.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const score = await supplierMatchingService.score({ ...auth, requestId }, id)
    return ok(score, { requestId, meta: { supplierId: id } })
  })
}
