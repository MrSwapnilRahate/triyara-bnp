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
 * Whether this process is a real deployment, as opposed to a production-mode
 * build running on someone's machine.
 *
 * Vercel sets these on every deployment, preview and production alike, and
 * nothing sets them locally. Three are checked rather than one because each is
 * exposed independently: a project that has turned some of them off should
 * still be recognised as a deployment. Recognising a deployment as local is the
 * one mistake that would matter here, so the test is deliberately eager.
 */
function isRealDeployment(): boolean {
  return Boolean(process.env.VERCEL ?? process.env.VERCEL_ENV ?? process.env.VERCEL_URL)
}

/**
 * Explicit, local-only opt-in to the log transport under `next start`.
 *
 * Running the production build locally - to benchmark it, or to reproduce
 * something that only happens in a real build - otherwise requires real Resend
 * credentials, and supplying them means a load test sends real email to real
 * addresses. Faking the credentials is worse: `apiKey && from` selects the
 * Resend transport, so the first send attempts a real network call with a
 * bogus key.
 *
 * `EMAIL_TRANSPORT=log` says what is wanted instead of implying it, mirroring
 * `STORAGE_PROVIDER`. It is NOT sufficient on its own: the opt-in only applies
 * off a deployment. On Vercel the variable is ignored entirely, so setting it
 * in the project's environment - by habit, by copy-paste, or by accident -
 * cannot disable the guard that production depends on.
 */
function isLocalLogTransportOptIn(): boolean {
  return process.env.EMAIL_TRANSPORT === 'log' && !isRealDeployment()
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
 *
 * `EMAIL_TRANSPORT=log` opts back into logging for a production build running
 * locally, and only there. See `isLocalLogTransportOptIn`.
 */
export function createEmailTransportFromEnv(logger: EmailLogger): EmailTransport {
  const apiKey = process.env.RESEND_API_KEY ?? ''
  const from = process.env.EMAIL_FROM ?? ''

  if (apiKey && from) return createResendTransport({ apiKey, from })

  if (isServingProduction() && !isPreviewDeployment() && !isLocalLogTransportOptIn()) {
    const missing = [
      ['RESEND_API_KEY', apiKey],
      ['EMAIL_FROM', from],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name)

    throw new Error(
      `Email is not configured: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} ` +
        `not set. Registration confirmations, approval decisions and password resets would ` +
        `silently never arrive. To run the production build locally without sending mail, ` +
        `set EMAIL_TRANSPORT=log. See docs/07-deployment/README.md.`,
    )
  }

  return createLogTransport(logger)
}
