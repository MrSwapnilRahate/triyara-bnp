import { supplierApprovalSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { supplierMasterService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/suppliers/:id/approval - review decision (ADMIN)
//
// The workflow itself already existed: `supplierMasterService.decide` validates
// the transition against the legal state machine, and the repository sets
// isVerified/verifiedAt when a supplier reaches APPROVED. Only the route was
// missing, so registration had no way to be reviewed. This adds the door, not
// the machinery.
//
// If-Match is required: two reviewers opening the same pending registration is
// exactly the case optimistic concurrency exists for, and an approval that
// silently overwrote a rejection would be the worst possible loss here.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, supplierApprovalSchema)
    const supplier = await supplierMasterService.decide(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(supplier, { requestId, etag: etag(supplier.version) })
  })
}
