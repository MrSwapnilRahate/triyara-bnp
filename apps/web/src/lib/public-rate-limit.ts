import { createInMemoryRateLimiter } from '@triyara/auth'
import { AppError } from '@triyara/lib'

// Abuse controls for UNAUTHENTICATED endpoints (TRY-BNP-SUPPLIER-REG).
//
// `enforceWriteLimit` in ./api keys on `user.id`, which does not exist out here.
// Anonymous traffic needs its own key, and a far tighter allowance: a public
// endpoint that writes rows and accepts files is the one surface on the
// platform an attacker can reach without credentials.
//
// Single-instance, like the authenticated limiter it sits beside. Behind more
// than one instance this bounds each process rather than the fleet, so a shared
// store (Redis) is the production answer — the same caveat the existing
// limiter carries, recorded here so it is not mistaken for a complete control.

/** Submissions are heavy: rows, files, and a human on the other end. */
const submitLimiter = createInMemoryRateLimiter(5, 60 * 60 * 1000)

/** Presigns are lighter but still hand out write targets. */
const presignLimiter = createInMemoryRateLimiter(40, 60 * 60 * 1000)

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is trivially spoofed when nothing trusted sets it, so this
 * is a throttle on casual abuse, not an identity. It is never used for
 * authorization, only to bound how often one apparent origin may write.
 * The FIRST entry is taken: proxies append, so later entries are the hops.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

function enforce(
  limiter: ReturnType<typeof createInMemoryRateLimiter>,
  req: Request,
  message: string,
): void {
  if (!limiter.check(clientKey(req)).allowed) {
    throw new AppError(message, 'RATE_LIMITED', 429)
  }
}

export function enforcePublicSubmitLimit(req: Request): void {
  enforce(
    submitLimiter,
    req,
    'Too many registrations from this connection. Please try again later, or contact us directly.',
  )
}

export function enforcePublicUploadLimit(req: Request): void {
  enforce(presignLimiter, req, 'Too many uploads from this connection. Please try again later.')
}
