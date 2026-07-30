import { createSupplierSchema, listSuppliersQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { supplierMasterService } from '@/lib/supplier-master-service'

// GET  /api/suppliers - list with search, filters, sorting, cursor paging
// POST /api/suppliers - onboard a supplier (ADMIN, EXPORT_MANAGER)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listSuppliersQuerySchema)
    const result = await supplierMasterService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          q: query.q ?? null,
          status: query.status ?? null,
          businessType: query.businessType ?? null,
          country: query.country ?? null,
          city: query.city ?? null,
          isVerified: query.isVerified ?? null,
          productId: query.productId ?? null,
          tagId: query.tagId ?? null,
          gstNumber: query.gstNumber ?? null,
          iecNumber: query.iecNumber ?? null,
          panNumber: query.panNumber ?? null,
          includeDeleted: query.includeDeleted ?? null,
        },
        sort: query.sort ?? '-createdAt',
      },
    })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, createSupplierSchema)
    const supplier = await supplierMasterService.create({ ...auth, requestId }, dto)
    return ok(supplier, { requestId, status: 201, etag: etag(supplier.version) })
  })
}
