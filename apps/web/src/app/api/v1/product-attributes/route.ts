import { catalogReferenceRepository } from '@triyara/db'

import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const items = await catalogReferenceRepository.listAttributes(auth.organizationId)
    return ok(items, { requestId })
  })
}
