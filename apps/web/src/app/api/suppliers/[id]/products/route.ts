import { listSupplierProductsQuerySchema, supplierOfferingSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { supplierOfferingService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/products - what this supplier offers, cursor-paged.
// The supplier id comes from the path, so it is not accepted in the query -
// otherwise a caller could page one supplier while filtering by another.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const query = parseQuery(new URL(req.url).searchParams, listSupplierProductsQuerySchema)
    const result = await supplierOfferingService.list(
      { ...auth, requestId },
      { ...query, supplierId: id },
    )
    return ok(result.items, {
      requestId,
      meta: {
        supplierId: id,
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          productId: query.productId ?? null,
          status: query.status ?? null,
          isPreferred: query.isPreferred ?? null,
        },
      },
    })
  })
}

// POST /api/suppliers/:id/products - add an offering (ADMIN, EXPORT_MANAGER)
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, supplierOfferingSchema)
    const offering = await supplierOfferingService.add({ ...auth, requestId }, id, dto)
    return ok(offering, { requestId, status: 201, etag: etag(offering.version) })
  })
}
