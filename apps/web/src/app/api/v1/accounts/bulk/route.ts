import { bulkAccountSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, bulkAccountSchema)
    const result = await accountService.bulk({ ...auth, requestId }, dto)
    return ok(result, { requestId, status: 202 })
  })
}
