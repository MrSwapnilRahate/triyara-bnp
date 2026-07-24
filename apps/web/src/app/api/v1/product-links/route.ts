import { z } from 'zod'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, parseQuery, route } from '@/lib/api'
import { productLinkService } from '@/lib/product-link-service'

const linkSchema = z.object({
  sourceType: z.enum(['SUPPLIER_PRODUCT', 'BUYER_PRODUCT']),
  sourceId: z.string().min(1),
  productId: z.string().min(1),
})
const querySchema = z.object({
  sourceType: z.enum(['SUPPLIER_PRODUCT', 'BUYER_PRODUCT']),
  sourceIds: z.string().transform((s) => s.split(',').filter(Boolean)),
})

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { sourceType, sourceIds } = parseQuery(new URL(req.url).searchParams, querySchema)
    const links = await productLinkService.resolve({ ...auth, requestId }, sourceType, sourceIds)
    return ok(links, { requestId })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, linkSchema)
    const link = await productLinkService.link(
      { ...auth, requestId },
      dto.sourceType,
      dto.sourceId,
      dto.productId,
    )
    return ok(link, { requestId, status: 201 })
  })
}
