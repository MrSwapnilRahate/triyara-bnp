import { createAccountSchema, listAccountsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listAccountsQuerySchema)
    const result = await accountService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor, hasMore: result.hasMore },
      },
    })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, createAccountSchema)
    const account = await accountService.create({ ...auth, requestId }, dto)
    return ok(account, { requestId, status: 201, etag: etag(account.version) })
  })
}
