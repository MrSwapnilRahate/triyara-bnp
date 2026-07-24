import type { DomainEvent } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { mapEventToNotification } from './notification.mapper'

function ev(type: string, data: Record<string, unknown>): DomainEvent {
  return {
    id: 'e',
    type,
    occurredAt: new Date().toISOString(),
    organizationId: 'o',
    actor: { type: 'user', id: 'u1' },
    data,
  }
}

describe('mapEventToNotification', () => {
  it('maps verification.approved to a HIGH priority VERIFICATION notification', () => {
    const n = mapEventToNotification(
      ev('verification.approved', { verificationId: 'v1', accountId: 'a1' }),
    )
    expect(n.type).toBe('VERIFICATION')
    expect(n.priority).toBe('HIGH')
    expect(n.entityId).toBe('v1')
    expect(n.title).toMatch(/approved/i)
  })
  it('maps document.uploaded to NORMAL DOCUMENT with the doc type in the body', () => {
    const n = mapEventToNotification(
      ev('document.uploaded', { documentId: 'd1', accountId: 'a1', type: 'GST' }),
    )
    expect(n.type).toBe('DOCUMENT')
    expect(n.priority).toBe('NORMAL')
    expect(n.body).toMatch(/GST/)
  })
  it('maps unknown families to SYSTEM', () => {
    const n = mapEventToNotification(ev('order.placed', { accountId: 'a1' }))
    expect(n.type).toBe('SYSTEM')
  })
})
