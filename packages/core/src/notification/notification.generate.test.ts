import type {
  NewNotification,
  NotificationPreferenceRepository,
  NotificationRepository,
  RecipientSpec,
} from '@triyara/db'
import type { DomainEvent } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { generateNotifications } from './notification.generate'

function ev(type: string): DomainEvent {
  return {
    id: 'e',
    type,
    occurredAt: new Date().toISOString(),
    organizationId: 'org1',
    actor: { type: 'user', id: 'u1' },
    data: { accountId: 'a1', verificationId: 'v1' },
  }
}

describe('generateNotifications', () => {
  it('fans out to active users, excluding those who disabled or muted the type', async () => {
    let captured: { recipients: RecipientSpec[] } | null = null
    const notifications = {
      createWithRecipients: async (_input: NewNotification, recipients: RecipientSpec[]) => {
        captured = { recipients }
      },
    } as unknown as NotificationRepository
    const preferences = {
      getForUsers: async () =>
        new Map([
          ['u2', { enabled: true, muted: true, channels: [] }],
          ['u3', { enabled: false, muted: false, channels: [] }],
        ]),
    } as unknown as NotificationPreferenceRepository
    const orgUsers = { listActiveUserIds: async () => ['u1', 'u2', 'u3', 'u4'] }

    await generateNotifications(
      { notifications, preferences, orgUsers },
      ev('verification.approved'),
    )

    expect(captured).not.toBeNull()
    expect(captured!.recipients.map((r) => r.userId).sort()).toEqual(['u1', 'u4']) // u2 muted, u3 disabled
    expect(captured!.recipients[0]!.channels).toEqual(['IN_APP'])
  })

  it('does nothing when there are no active users', async () => {
    let called = false
    const notifications = {
      createWithRecipients: async () => {
        called = true
      },
    } as unknown as NotificationRepository
    const preferences = {
      getForUsers: async () => new Map(),
    } as unknown as NotificationPreferenceRepository
    await generateNotifications(
      { notifications, preferences, orgUsers: { listActiveUserIds: async () => [] } },
      ev('account.created'),
    )
    expect(called).toBe(false)
  })
})
