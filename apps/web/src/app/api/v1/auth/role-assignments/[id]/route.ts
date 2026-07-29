import { revokeScopedRoleSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, route } from '@/lib/api'
import { scopedRoleService } from '@/lib/auth-extension-service'

// DELETE /api/v1/auth/role-assignments/:id -> revoke a scoped grant (ADMIN)
export function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, revokeScopedRoleSchema)
    const assignment = await scopedRoleService.revoke({ ...auth, requestId }, id, dto.reason)
    return ok(assignment, { requestId, etag: etag(assignment.version) })
  })
}
