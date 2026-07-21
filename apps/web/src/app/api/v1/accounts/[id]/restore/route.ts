import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const account = await accountService.restore({ ...auth, requestId }, id, version)
    return ok(account, { requestId, etag: etag(account.version) })
  })
}
