import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { verificationService } from '@/lib/verification-service'

type Params = { params: Promise<{ id: string }> }

export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)

    const v = await verificationService.reopen({ ...auth, requestId }, id, version)
    return ok(v, { requestId, etag: etag(v.version) })
  })
}
