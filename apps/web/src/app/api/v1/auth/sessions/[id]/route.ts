import { revokeSessionSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { sessionService } from '@/lib/auth-extension-service'

// DELETE /api/v1/auth/sessions/:id -> revoke a session
export function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, revokeSessionSchema)
    const session = await sessionService.revoke({ ...auth, requestId }, id, dto.reason)
    return ok(session, { requestId })
  })
}
