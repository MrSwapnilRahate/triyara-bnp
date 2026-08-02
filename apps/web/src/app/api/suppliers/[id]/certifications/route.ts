import { supplierCertificationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, route } from '@/lib/api'
import { supplierCertificationService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/certifications - what this supplier holds.
//
// Not paginated: a supplier holds a handful of certificates, and a cursor over
// five rows costs more to use than it saves. Soonest expiry first, because the
// compliance question is what lapses next.
//
// Distinct from GET /api/suppliers/certifications, which is unchanged and
// answers a different question - which certification types exist across the
// tenant, for building a filter.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const certifications = await supplierCertificationService.list({ ...auth, requestId }, id)
    return ok(certifications, {
      requestId,
      meta: { supplierId: id, count: certifications.length },
    })
  })
}

// POST /api/suppliers/:id/certifications - record one (ADMIN, EXPORT_MANAGER).
//
// No If-Match: this creates a row rather than replacing one, so there is no
// version to be stale against. The mutations on :certificationId require it.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, supplierCertificationSchema)
    const certification = await supplierCertificationService.add({ ...auth, requestId }, id, dto)
    return ok(certification, { requestId, status: 201, etag: etag(certification.version) })
  })
}
