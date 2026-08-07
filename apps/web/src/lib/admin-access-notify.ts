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
  decision: 'approved' | 'rejected',
): Promise<string> {
  const { request, requesterUserId } = result
  const approved = decision === 'approved'

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
        title: approved ? 'Administrator access granted' : 'Administrator access declined',
        body: approved
          ? 'Your request for administrator access was approved. Sign out and back in to pick up your new permissions.'
          : `Your request for administrator access was declined. ${request.decisionReason ?? ''}`.trim(),
        metadata: { requestId: request.id, decision },
      },
      [{ userId: requesterUserId, channels: ['IN_APP'] }],
    )
  } catch (err) {
    logger.error({ err: String(err), requestId: request.id }, 'admin_access.notification_failed')
  }

  const delivery = approved
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
}
