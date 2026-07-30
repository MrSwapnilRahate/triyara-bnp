import { CERTIFICATION_TYPES } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { supplierMasterService } from '@/lib/supplier-master-service'

// GET /api/suppliers/certifications - certification types held by this tenant,
// each with a total and how many are currently ACTIVE. `meta.vocabulary` carries
// the full enum so a filter UI can offer the unheld types too.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const certifications = await supplierMasterService.certifications({ ...auth, requestId })
    return ok(certifications, {
      requestId,
      meta: {
        count: certifications.length,
        vocabulary: CERTIFICATION_TYPES,
      },
    })
  })
}
