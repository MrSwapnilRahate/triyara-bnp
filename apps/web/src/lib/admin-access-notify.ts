import type { DecisionResult } from '@triyara/core'
import { notificationRepository } from '@triyara/db'
import { logger } from '@triyara/lib'

import { emailService } from './email'

/**
 * Tells the requester what was decided.
 *
 * The in-app notification is addressed to one person rather than generated
 * through `generateNotifications`, which fans an event out to every active user
 * in the tenant. A decision about one person's privileges is not organisation
 * news, so this uses the repository's explicit-recipient path instead — the
 * same table, the same shape, a narrower audience.
 *
 * Both side effects are best-effort. The decision and the role grant are
 * already committed by the time this runs; failing the request now would
 * report an error for something that has irreversibly happened.
 */
export async function notifyAdminAccessDecision(
  result: DecisionResult,
  decision: 'approved' | 'rejected' | 'revoked',
): Promise<string> {
  const { request, requesterUserId } = result
  const approved = decision === 'approved'
  const revoked = decision === 'revoked'

  try {
    await notificationRepository.createWithRecipients(
      {
        organizationId: request.organizationId,
        type: 'SYSTEM',
        priority: approved ? 'HIGH' : 'NORMAL',
        actorId: request.decidedById,
        entityType: 'User',
        entityId: requesterUserId,
        accountId: null,
        eventName: `admin_access_request.${decision}`,
        title: revoked
          ? 'Administrator access withdrawn'
          : approved
            ? 'Administrator access granted'
            : 'Administrator access declined',
        body: revoked
          ? `Your administrator access has been withdrawn. ${request.revocationReason ?? ''}`.trim()
          : approved
            ? 'Your request for administrator access was approved.'
            : `Your request for administrator access was declined. ${request.decisionReason ?? ''}`.trim(),
        metadata: { requestId: request.id, decision },
      },
      [{ userId: requesterUserId, channels: ['IN_APP'] }],
    )
  } catch (err) {
    logger.error({ err: String(err), requestId: request.id }, 'admin_access.notification_failed')
  }

  try {
    const delivery = revoked
      ? await emailService.adminAccessRevoked({
          requesterName: request.requesterName,
          requesterEmail: request.requesterEmail,
          reason: request.revocationReason ?? '',
        })
      : approved
        ? await emailService.adminAccessApproved({
            requesterName: request.requesterName,
            requesterEmail: request.requesterEmail,
          })
        : await emailService.adminAccessRejected({
            requesterName: request.requesterName,
            requesterEmail: request.requesterEmail,
            reason: request.decisionReason ?? '',
          })
    return delivery.status
  } catch (err) {
    // The decision and the role change are already committed. Turning an email
    // problem into a 500 here would report failure for something that
    // irreversibly happened, and would tempt the caller to retry it.
    logger.error({ err: String(err), requestId: request.id }, 'admin_access.email_failed')
    return 'failed'
  }
}
