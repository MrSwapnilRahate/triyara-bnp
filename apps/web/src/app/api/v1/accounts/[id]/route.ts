import { updateAccountSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const account = await accountService.get({ ...auth, requestId }, id, { includeDeleted })
    return ok(account, { requestId, etag: etag(account.version) })
  })
}

export function PATCH(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, updateAccountSchema)
    const account = await accountService.update({ ...auth, requestId }, id, dto, version)
    return ok(account, { requestId, etag: etag(account.version) })
  })
}

export function DELETE(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const account = await accountService.remove({ ...auth, requestId }, id, version)
    return ok(account, { requestId, etag: etag(account.version) })
  })
}
