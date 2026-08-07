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
 * Selects the transport from env. Default is the log transport, so local
 * development needs no key and no network.
 *
 * In production a missing key is refused rather than degraded to logging.
 * Email is the only channel that reaches a supplier or buyer at all - they
 * have no account and no inbox in the product - so silently not sending is
 * indistinguishable, from their side, from never having registered.
 */
export function createEmailTransportFromEnv(logger: EmailLogger): EmailTransport {
  const apiKey = process.env.RESEND_API_KEY ?? ''
  const from = process.env.EMAIL_FROM ?? ''

  if (apiKey && from) return createResendTransport({ apiKey, from })

  if (isServingProduction()) {
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
