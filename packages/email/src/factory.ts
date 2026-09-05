import { createLogTransport } from './log-transport'
import { createResendTransport } from './resend'
import type { EmailLogger, EmailTransport } from './types'

/**
 * Whether this process is serving traffic, as opposed to building.
 *
 * Mirrors @triyara/storage: `next build` runs with NODE_ENV=production and
 * evaluates route modules, so NODE_ENV alone cannot tell a real deployment
 * from a build step.
 */
function isServingProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build'
  )
}

/**
 * Whether this is a Vercel preview deployment rather than the production one.
 *
 * `VERCEL_ENV` is a system variable set to 'production', 'preview' or
 * 'development' on every deployment. Only 'production' is the deployment a
 * buyer or supplier ever reaches, and only there does a missing key mean mail
 * that silently never arrives - the failure the guard below exists to prevent.
 *
 * A preview is built from a branch, thrown away, and reached by the team alone,
 * so requiring real credentials there protected nobody. It did the opposite:
 * the transport is constructed at module scope, so an unconfigured preview did
 * not merely disable email, it threw while the module was being imported.
 * `@/lib/email` is imported by the auth server actions and, through a shared
 * chunk, by the NextAuth route handler - so sign-in, password reset and the
 * session endpoint all answered 500 on any preview without a key.
 *
 * Giving previews a live Resend key would be the wrong way to fix that: every
 * open branch would then send real mail to real addresses.
 *
 * If `VERCEL_ENV` is absent - system variables can be turned off - this returns
 * false and the guard still applies, which is the safe direction to be wrong in.
 */
function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === 'preview'
}

/**
 * Selects the transport from env. Default is the log transport, so local
 * development needs no key and no network.
 *
 * In production a missing key is refused rather than degraded to logging.
 * Email is the only channel that reaches a supplier or buyer at all - they
 * have no account and no inbox in the product - so silently not sending is
 * indistinguishable, from their side, from never having registered.
 *
 * "Production" there means the production deployment, not merely NODE_ENV:
 * preview deployments log instead. See `isPreviewDeployment`.
 */
export function createEmailTransportFromEnv(logger: EmailLogger): EmailTransport {
  const apiKey = process.env.RESEND_API_KEY ?? ''
  const from = process.env.EMAIL_FROM ?? ''

  if (apiKey && from) return createResendTransport({ apiKey, from })

  if (isServingProduction() && !isPreviewDeployment()) {
    const missing = [
      ['RESEND_API_KEY', apiKey],
      ['EMAIL_FROM', from],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name)

    throw new Error(
      `Email is not configured: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} ` +
        `not set. Registration confirmations, approval decisions and password resets would ` +
        `silently never arrive. See docs/07-deployment/README.md.`,
    )
  }

  return createLogTransport(logger)
}
