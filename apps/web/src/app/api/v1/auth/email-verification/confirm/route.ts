import { confirmEmailVerificationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { emailVerificationService } from '@/lib/auth-extension-service'

// POST /api/v1/auth/email-verification/confirm
export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, confirmEmailVerificationSchema)
    const profile = await emailVerificationService.confirm({ ...auth, requestId }, dto)
    return ok(
      { userId: profile.userId, emailVerifiedAt: profile.emailVerifiedAt, verified: true },
      { requestId },
    )
  })
}
