import { catalogReferenceRepository } from '@triyara/db'

import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const q = new URL(req.url).searchParams.get('q') ?? undefined
    const items = await catalogReferenceRepository.listHsCodes(auth.organizationId, q)
    return ok(items, { requestId })
  })
}
