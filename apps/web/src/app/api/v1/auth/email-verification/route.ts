import { logger } from '@triyara/lib'
import { requestEmailVerificationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { emailVerificationService } from '@/lib/auth-extension-service'
import { emailService } from '@/lib/email'

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

    // The plaintext token leaves the process ONLY in the email. It is not in
    // the response body and it is not logged - a log line carrying it would let
    // anyone with log access confirm any address, which is the whole point of
    // hashing it at rest.
    //
    // A delivery failure does not fail the request, matching password reset:
    // the token is already issued and valid, and the user can ask again.
    try {
      await emailService.emailVerification({
        email: issued.email,
        token: issued.token,
        expiresInMinutes: Math.round((issued.expiresAt.getTime() - Date.now()) / 60_000),
      })
    } catch (err) {
      logger.error(
        { err: String(err), userId: targetUserId ?? auth.user.id },
        'email_verification.email_failed',
      )
    }

    return ok(
      { email: issued.email, expiresAt: issued.expiresAt, sent: true },
      { requestId, status: 202 },
    )
  })
}
