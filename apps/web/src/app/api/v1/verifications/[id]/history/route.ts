import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { verificationService } from '@/lib/verification-service'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const history = await verificationService.history({ ...auth, requestId }, id)
    return ok(history, { requestId })
  })
}
