import { changeStatusSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, changeStatusSchema)
    const account = await accountService.changeStatus({ ...auth, requestId }, id, dto, version)
    return ok(account, { requestId, etag: etag(account.version) })
  })
}
