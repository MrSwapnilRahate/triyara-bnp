import { presignAvatarSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { avatarService } from '@/lib/avatar-service'

// POST /api/v1/me/avatar/presign - an upload target for the caller's own photo.
//
// No ability check beyond authentication, for the same reason /api/v1/me needs
// none: the storage key is built from the session, so there is no parameter
// through which a caller could aim this at anybody else. The body carries only
// a declared type and size, and neither is trusted - the type is checked
// against the image allow-list here, the size for real on confirmation.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, presignAvatarSchema)
    const presigned = await avatarService.presign({ ...auth, requestId }, dto)
    return ok(presigned, { requestId })
  })
}
