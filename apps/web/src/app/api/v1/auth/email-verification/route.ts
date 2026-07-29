import { logger } from '@triyara/lib'
import { requestEmailVerificationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { emailVerificationService } from '@/lib/auth-extension-service'

// GET  /api/v1/auth/email-verification        -> own verification status
// POST /api/v1/auth/email-verification        -> issue a verification token
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const userId = new URL(req.url).searchParams.get('userId') ?? undefined
    const profile = await emailVerificationService.status({ ...auth, requestId }, userId)
    return ok(
      {
        userId: profile.userId,
        emailVerifiedAt: profile.emailVerifiedAt,
        verified: profile.emailVerifiedAt !== null,
      },
      { requestId },
    )
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, requestEmailVerificationSchema)
    const targetUserId = new URL(req.url).searchParams.get('userId') ?? undefined

    const issued = await emailVerificationService.request({ ...auth, requestId }, dto, {
      userId: targetUserId,
    })

    // The plaintext token is deliberately NOT returned in the response body.
    // Email delivery arrives with the notifications transport; until then the
    // link is logged, matching the existing password-reset flow.
    logger.info(
      { userId: targetUserId ?? auth.user.id, verifyPath: `/verify-email?token=${issued.token}` },
      'Email verification requested',
    )

    return ok(
      { email: issued.email, expiresAt: issued.expiresAt, sent: true },
      { requestId, status: 202 },
    )
  })
}
