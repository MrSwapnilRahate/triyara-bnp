import type { Rendered } from './templates'
import * as templates from './templates'
import type { EmailLogger, EmailTransport, SendResult } from './types'

export interface EmailServiceDeps {
  transport: EmailTransport
  logger: EmailLogger
  /** Absolute origin used to build links, e.g. https://bnp.triyaraexports.com. */
  appUrl: string
  /** Where "new registration" alerts go. Empty disables those, loudly. */
  staffRecipients: string[]
  /**
   * Who decides admin access requests. Comes from the same centralized Super
   * Admin configuration the backend authorizes against, so the person emailed
   * and the person permitted to act can never drift apart.
   */
  superAdminRecipients: string[]
  /** Address a supplier or buyer replying to a decision should reach. */
  replyTo?: string
}

/** Enough of a contact to decide whether we can write to them. */
export interface Recipient {
  name: string
  email: string | null | undefined
}

// Deliberately permissive: this rejects the addresses that cannot possibly
// work, not the ones that merely look unusual. Real bounces are Resend's job
// to report; over-strict validation here would drop legitimate suppliers.
const PLAUSIBLE_ADDRESS = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

export function isSendableAddress(value: string | null | undefined): value is string {
  return typeof value === 'string' && PLAUSIBLE_ADDRESS.test(value.trim())
}

/**
 * Email delivery for the platform's transactional flows.
 *
 * Two rules hold everywhere in here:
 *
 *  - **It never throws.** Every method returns a SendResult. A failed
 *    confirmation must not roll back a registration that is already saved,
 *    and the caller should not have to remember that.
 *  - **A missing address is not an error.** Supplier and buyer contacts may
 *    legitimately have only a phone or WhatsApp number - the registration
 *    wizards accept that on purpose - so those are skipped and logged, not
 *    failed.
 */
export function createEmailService(deps: EmailServiceDeps) {
  const { transport, logger, appUrl, staffRecipients, superAdminRecipients, replyTo } = deps

  async function deliver(flow: string, to: string[], rendered: Rendered): Promise<SendResult> {
    if (to.length === 0) {
      logger.warn({ flow }, 'email.skipped_no_recipient')
      return { status: 'skipped', reason: 'no recipient address' }
    }

    let result: SendResult
    try {
      result = await transport.send({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(replyTo ? { replyTo } : {}),
      })
    } catch (err) {
      // A transport that throws rather than returning is a bug in the
      // transport; it still must not reach the request that triggered it.
      result = { status: 'failed', error: String(err), attempts: 1, retryable: false }
    }

    // One line per delivery, whatever the outcome - this is the delivery log.
    const base = { flow, transport: transport.name, recipients: to.length }
    if (result.status === 'sent') {
      logger.info({ ...base, id: result.id, attempts: result.attempts }, 'email.sent')
    } else if (result.status === 'skipped') {
      logger.warn({ ...base, reason: result.reason }, 'email.skipped')
    } else {
      logger.error(
        { ...base, error: result.error, attempts: result.attempts, retryable: result.retryable },
        'email.failed',
      )
    }
    return result
  }

  /** Filters to addresses we can actually write to, logging the ones we cannot. */
  function addressesFor(flow: string, recipients: Recipient[]): string[] {
    const usable: string[] = []
    for (const r of recipients) {
      if (isSendableAddress(r.email)) usable.push(r.email.trim())
      else logger.warn({ flow, contact: r.name }, 'email.contact_has_no_address')
    }
    return usable
  }

  return {
    async supplierRegistered(input: {
      contact: Recipient
      companyName: string
      supplierCode: string
    }): Promise<SendResult> {
      const to = addressesFor('supplier_registration_confirmation', [input.contact])
      return deliver(
        'supplier_registration_confirmation',
        to,
        templates.supplierRegistrationConfirmation({
          contactName: input.contact.name,
          companyName: input.companyName,
          supplierCode: input.supplierCode,
        }),
      )
    },

    async buyerRegistered(input: { contact: Recipient; companyName: string }): Promise<SendResult> {
      const to = addressesFor('buyer_registration_confirmation', [input.contact])
      return deliver(
        'buyer_registration_confirmation',
        to,
        templates.buyerRegistrationConfirmation({
          contactName: input.contact.name,
          companyName: input.companyName,
        }),
      )
    },

    async staffNewRegistration(input: {
      kind: 'supplier' | 'buyer'
      companyName: string
      country?: string
      reference?: string
    }): Promise<SendResult> {
      if (staffRecipients.length === 0) {
        // Not silent: with nobody configured, registrations pile up unseen.
        logger.warn({ flow: 'staff_new_registration' }, 'email.no_staff_recipients_configured')
        return { status: 'skipped', reason: 'EMAIL_STAFF_NOTIFICATIONS is not set' }
      }
      const path = input.kind === 'supplier' ? '/suppliers' : '/buyers'
      return deliver(
        'staff_new_registration',
        staffRecipients,
        templates.staffNewRegistration({
          kind: input.kind,
          companyName: input.companyName,
          ...(input.country ? { country: input.country } : {}),
          ...(input.reference ? { reference: input.reference } : {}),
          reviewUrl: templates.joinUrl(appUrl, path),
        }),
      )
    },

    async registrationDecided(input: {
      kind: 'supplier' | 'buyer'
      decision: 'approved' | 'rejected'
      contact: Recipient
      companyName: string
      comments?: string
    }): Promise<SendResult> {
      const flow = `${input.kind}_${input.decision}`
      const to = addressesFor(flow, [input.contact])
      const rendered =
        input.decision === 'approved'
          ? templates.registrationApproved({
              kind: input.kind,
              contactName: input.contact.name,
              companyName: input.companyName,
              ...(input.comments ? { comments: input.comments } : {}),
            })
          : templates.registrationRejected({
              kind: input.kind,
              contactName: input.contact.name,
              companyName: input.companyName,
              ...(input.comments ? { comments: input.comments } : {}),
            })
      return deliver(flow, to, rendered)
    },

    async passwordReset(input: {
      email: string
      token: string
      expiresInMinutes: number
    }): Promise<SendResult> {
      const to = addressesFor('password_reset', [{ name: input.email, email: input.email }])
      return deliver(
        'password_reset',
        to,
        templates.passwordReset({
          resetUrl: templates.joinUrl(
            appUrl,
            `/reset-password?token=${encodeURIComponent(input.token)}`,
          ),
          expiresInMinutes: input.expiresInMinutes,
        }),
      )
    },

    /**
     * Tells the super administrator that someone wants admin access.
     *
     * Goes only to the configured Super Admins - never to the wider staff
     * list. Who may approve and who is told are the same set by construction.
     */
    async adminAccessRequested(input: {
      requesterName: string
      requesterEmail: string
      organizationName: string
      currentRole: string
      reason: string
      requestedAt: Date
      requestId: string
    }): Promise<SendResult> {
      if (superAdminRecipients.length === 0) {
        logger.warn({ flow: 'admin_access_requested' }, 'email.no_super_admin_configured')
        return { status: 'skipped', reason: 'no super administrator configured' }
      }
      const base = templates.joinUrl(appUrl, `/admin/access-requests?request=${input.requestId}`)
      return deliver(
        'admin_access_requested',
        superAdminRecipients,
        templates.adminAccessRequested({
          requesterName: input.requesterName,
          requesterEmail: input.requesterEmail,
          organizationName: input.organizationName,
          currentRole: input.currentRole,
          reason: input.reason,
          requestedAt: input.requestedAt,
          // Both buttons open the dashboard rather than acting from the inbox.
          // A link that approved on click would grant platform control to
          // anyone who ever saw the message.
          approveUrl: `${base}&action=approve`,
          rejectUrl: `${base}&action=reject`,
        }),
      )
    },

    async adminAccessApproved(input: {
      requesterName: string
      requesterEmail: string
    }): Promise<SendResult> {
      const to = addressesFor('admin_access_approved', [
        { name: input.requesterName, email: input.requesterEmail },
      ])
      return deliver(
        'admin_access_approved',
        to,
        templates.adminAccessApproved({ requesterName: input.requesterName }),
      )
    },

    async adminAccessRejected(input: {
      requesterName: string
      requesterEmail: string
      reason: string
    }): Promise<SendResult> {
      const to = addressesFor('admin_access_rejected', [
        { name: input.requesterName, email: input.requesterEmail },
      ])
      return deliver(
        'admin_access_rejected',
        to,
        templates.adminAccessRejected({
          requesterName: input.requesterName,
          reason: input.reason,
        }),
      )
    },

    /**
     * Staff invitation. There is no invite flow in the product yet - admin user
     * creation exposes no invite endpoint - so nothing calls this today. It
     * exists so that whoever builds that flow inherits the transport, retry,
     * logging and template rather than reinventing them.
     */
    async staffInvite(input: {
      email: string
      inviterName: string
      token: string
      expiresInHours: number
    }): Promise<SendResult> {
      const to = addressesFor('staff_invite', [{ name: input.email, email: input.email }])
      return deliver(
        'staff_invite',
        to,
        templates.staffInvite({
          inviterName: input.inviterName,
          inviteUrl: templates.joinUrl(
            appUrl,
            // The invitation carries a PasswordResetToken, and /reset-password
            // is the page that consumes one. A separate /accept-invite page
            // would be a second screen doing the same job.
            `/reset-password?token=${encodeURIComponent(input.token)}`,
          ),
          expiresInHours: input.expiresInHours,
        }),
      )
    },
  }
}

export type EmailService = ReturnType<typeof createEmailService>
