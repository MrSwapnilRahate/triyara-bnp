import type { DomainEvent } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { mapEventToActivity } from './activity.mapper'

function ev(
  type: string,
  data: Record<string, unknown>,
  actorId: string | null = 'u1',
): DomainEvent {
  return {
    id: 'e1',
    type,
    occurredAt: new Date().toISOString(),
    organizationId: 'org1',
    actor: { type: actorId ? 'user' : 'system', id: actorId },
    data,
  }
}

describe('mapEventToActivity', () => {
  it('maps a document upload', () => {
    const a = mapEventToActivity(
      ev('document.uploaded', { documentId: 'd1', accountId: 'acc1', type: 'GST' }),
    )
    expect(a.entityType).toBe('Document')
    expect(a.entityId).toBe('d1')
    expect(a.accountId).toBe('acc1')
    expect(a.activityType).toBe('UPLOADED')
    expect(a.description).toBe('Document uploaded (GST)')
    expect(a.actorType).toBe('user')
  })

  it('maps a verification approval', () => {
    const a = mapEventToActivity(
      ev('verification.approved', { verificationId: 'v1', accountId: 'acc1', status: 'VERIFIED' }),
    )
    expect(a.entityType).toBe('Verification')
    expect(a.entityId).toBe('v1')
    expect(a.activityType).toBe('APPROVED')
  })

  it('maps account status_changed and system actors', () => {
    const a = mapEventToActivity(ev('account.status_changed', { accountId: 'acc1' }, null))
    expect(a.activityType).toBe('STATUS_CHANGED')
    expect(a.actorType).toBe('system')
  })

  it('handles unknown/future event families generically', () => {
    const a = mapEventToActivity(ev('order.placed', { accountId: 'acc1', orderId: 'o1' }))
    expect(a.entityType).toBe('Order')
    expect(a.activityType).toBe('OTHER')
    expect(a.eventName).toBe('order.placed')
  })
})
