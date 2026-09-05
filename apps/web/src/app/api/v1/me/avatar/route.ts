import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, route } from '@/lib/api'
import { avatarService } from '@/lib/avatar-service'

// PUT    /api/v1/me/avatar - confirm the upload landed and point the profile at it.
// DELETE /api/v1/me/avatar - remove the photo and the stored object.
//
// Both resolve the user from the session. There is no body on either: the only
// thing that identifies the object is the key, and the key is derived, so there
// is nothing for a caller to supply and nothing to validate.
export function PUT(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const result = await avatarService.confirm({ ...auth, requestId })
    return ok(result, { requestId })
  })
}

export function DELETE(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    await avatarService.remove({ ...auth, requestId })
    return ok({ avatarUrl: null }, { requestId })
  })
}
