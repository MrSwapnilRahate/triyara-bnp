import { getSuperAdminEmails } from '@triyara/core'
import { createEmailService, createEmailTransportFromEnv } from '@triyara/email'
import { logger } from '@triyara/lib'

/**
 * Composition root for email.
 *
 * The transport is chosen from the environment once, at module scope, exactly
 * as storage is - so a production deployment with no Resend key fails at
 * startup rather than on the first supplier who registers.
 */
function resolveAppUrl(): string {
  const configured = process.env.APP_URL
  if (configured) return configured.replace(/\/+$/, '')
  // Vercel sets this for every deployment; it makes preview deploys produce
  // links that point at themselves rather than at nothing.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function staffRecipients(): string[] {
  return (process.env.EMAIL_STAFF_NOTIFICATIONS ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
}

export const emailService = createEmailService({
  transport: createEmailTransportFromEnv(logger),
  logger,
  appUrl: resolveAppUrl(),
  staffRecipients: staffRecipients(),
  // The same list the backend authorizes decisions against, so the person
  // emailed and the person permitted to act cannot drift apart.
  superAdminRecipients: getSuperAdminEmails(),
  ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
})
