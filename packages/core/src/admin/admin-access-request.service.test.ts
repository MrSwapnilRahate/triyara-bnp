import { buildAbilityFor, type Role } from '@triyara/auth'
import type { AdminAccessRequestRecord, AdminAccessRequestRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { PreconditionFailedError } from '@triyara/lib'
import { describe, expect, it } from 'vitest'

import {
  type AdminAccessRequestCtx,
  createAdminAccessRequestService,
} from './admin-access-request.service'

const SUPER = 'swapnilrahate6598@gmail.com'

function ctxFor(roles: Role[], email = 'staff@triyara.test', id = 'u1'): AdminAccessRequestCtx {
  const user = { id, organizationId: 'org1', email, name: 'A Person', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeRequest(over: Partial<AdminAccessRequestRecord> = {}): AdminAccessRequestRecord {
  return {
    id: 'req1',
    organizationId: 'org1',
    userId: 'u1',
    requesterName: 'A Person',
    requesterEmail: 'staff@triyara.test',
    currentRole: 'EXPORT_MANAGER',
    reason: 'I action the supplier review queue every day and need approvals.',
    status: 'PENDING',
    decidedById: null,
    decidedAt: null,
    decisionReason: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as AdminAccessRequestRecord
}

const events = (sink: DomainEvent[] = []): EventBus =>
  ({
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
  }) as unknown as EventBus

function repo(over: Partial<AdminAccessRequestRepository> = {}): AdminAccessRequestRepository {
  return {
    create: async () => makeRequest(),
    findById: async () => makeRequest(),
    findPendingForUser: async () => null,
    list: async () => ({ items: [], nextCursor: null }),
    approve: async () => makeRequest({ status: 'APPROVED', version: 2 }),
    reject: async () => makeRequest({ status: 'REJECTED', version: 2 }),
    ...over,
  } as AdminAccessRequestRepository
}

const DTO = { reason: 'I action the supplier review queue every day and need approvals.' }

describe('requesting access', () => {
  it('records a request for a non-admin', async () => {
    const sink: DomainEvent[] = []
    const svc = createAdminAccessRequestService({ repo: repo(), events: events(sink) })
    const result = await svc.request(ctxFor(['EXPORT_MANAGER']), DTO)
    expect(result.status).toBe('PENDING')
    expect(sink.find((e) => e.type === 'admin_access_request.submitted')).toBeDefined()
  })

  it('takes the requester from the session, never from the body', async () => {
    let passed: unknown = null
    const svc = createAdminAccessRequestService({
      repo: repo({
        create: async (_ctx, data) => {
          passed = data
          return makeRequest()
        },
      } as Partial<AdminAccessRequestRepository>),
      events: events(),
    })
    await svc.request(ctxFor(['VERIFIER'], 'verifier@triyara.test', 'u7'), DTO)
    expect(passed).toMatchObject({
      userId: 'u7',
      requesterEmail: 'verifier@triyara.test',
      currentRole: 'VERIFIER',
    })
  })

  it('refuses someone who is already an administrator', async () => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    await expect(svc.request(ctxFor(['ADMIN']), DTO)).rejects.toThrow(
      /already have administrator access/i,
    )
  })

  it('does not emit when the request is refused', async () => {
    const sink: DomainEvent[] = []
    const svc = createAdminAccessRequestService({ repo: repo(), events: events(sink) })
    await expect(svc.request(ctxFor(['ADMIN']), DTO)).rejects.toThrow()
    expect(sink).toHaveLength(0)
  })

  it('surfaces a duplicate pending request from the database', async () => {
    const svc = createAdminAccessRequestService({
      repo: repo({
        create: async () => {
          throw new Error('You already have a pending admin access request.')
        },
      } as Partial<AdminAccessRequestRepository>),
      events: events(),
    })
    await expect(svc.request(ctxFor(['READ_ONLY']), DTO)).rejects.toThrow(/already have a pending/i)
  })
})

describe('decision authorization', () => {
  it('lets the super administrator approve', async () => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    const result = await svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1)
    expect(result.request.status).toBe('APPROVED')
  })

  it('refuses an ordinary ADMIN', async () => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    await expect(
      svc.approve(ctxFor(['ADMIN'], 'other-admin@triyara.test', 'u9'), 'req1', 1),
    ).rejects.toThrow(/super administrator/i)
  })

  it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']])('refuses a %s', async (role) => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    await expect(svc.approve(ctxFor([role as Role]), 'req1', 1)).rejects.toThrow(
      /super administrator/i,
    )
  })

  it('refuses an ordinary ADMIN on reject too', async () => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    await expect(
      svc.reject(ctxFor(['ADMIN'], 'other-admin@triyara.test'), 'req1', 1, { reason: 'no need' }),
    ).rejects.toThrow(/super administrator/i)
  })

  it('refuses the list to anyone but the super administrator', async () => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    await expect(
      svc.list(ctxFor(['ADMIN'], 'other-admin@triyara.test'), { limit: 25 }),
    ).rejects.toThrow(/super administrator/i)
  })

  it('matches the super administrator regardless of case', async () => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    const result = await svc.approve(ctxFor(['ADMIN'], SUPER.toUpperCase(), 'super1'), 'req1', 1)
    expect(result.request.status).toBe('APPROVED')
  })
})

describe('decision rules', () => {
  it('refuses approving your own request', async () => {
    const svc = createAdminAccessRequestService({
      repo: repo({ findById: async () => makeRequest({ userId: 'super1' }) }),
      events: events(),
    })
    await expect(svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1)).rejects.toThrow(
      /cannot approve your own/i,
    )
  })

  it('refuses deciding your own request on reject too', async () => {
    const svc = createAdminAccessRequestService({
      repo: repo({ findById: async () => makeRequest({ userId: 'super1' }) }),
      events: events(),
    })
    await expect(
      svc.reject(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1, { reason: 'changed my mind' }),
    ).rejects.toThrow(/cannot decide your own/i)
  })

  it.each([['APPROVED'], ['REJECTED']])('refuses approving an already %s request', async (s) => {
    const svc = createAdminAccessRequestService({
      repo: repo({ findById: async () => makeRequest({ status: s as 'APPROVED' }) }),
      events: events(),
    })
    await expect(svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1)).rejects.toThrow(
      new RegExp(`already been ${s.toLowerCase()}`, 'i'),
    )
  })

  it.each([['APPROVED'], ['REJECTED']])('refuses rejecting an already %s request', async (s) => {
    const svc = createAdminAccessRequestService({
      repo: repo({ findById: async () => makeRequest({ status: s as 'APPROVED' }) }),
      events: events(),
    })
    await expect(
      svc.reject(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1, { reason: 'not needed now' }),
    ).rejects.toThrow(new RegExp(`already been ${s.toLowerCase()}`, 'i'))
  })

  it('refuses a request that does not exist', async () => {
    const svc = createAdminAccessRequestService({
      repo: repo({ findById: async () => null }),
      events: events(),
    })
    await expect(svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'gone', 1)).rejects.toThrow(
      /not found/i,
    )
  })

  it('passes the caller version through for optimistic concurrency', async () => {
    let seen: number | undefined
    const svc = createAdminAccessRequestService({
      repo: repo({
        approve: async (_ctx, _id, expectedVersion) => {
          seen = expectedVersion
          return makeRequest({ status: 'APPROVED', version: 9 })
        },
      } as Partial<AdminAccessRequestRepository>),
      events: events(),
    })
    await svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 8)
    expect(seen).toBe(8)
  })

  it('propagates a version conflict', async () => {
    const svc = createAdminAccessRequestService({
      repo: repo({
        approve: async () => {
          throw new PreconditionFailedError()
        },
      } as Partial<AdminAccessRequestRepository>),
      events: events(),
    })
    await expect(svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1)).rejects.toThrow(
      PreconditionFailedError,
    )
  })

  it('emits an approval event carrying who it was for', async () => {
    const sink: DomainEvent[] = []
    const svc = createAdminAccessRequestService({ repo: repo(), events: events(sink) })
    await svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1)
    const event = sink.find((e) => e.type === 'admin_access_request.approved')
    expect(event?.data).toMatchObject({ requestId: 'req1', userId: 'u1' })
  })

  it('emits a rejection event and returns the requester for notifying', async () => {
    const sink: DomainEvent[] = []
    const svc = createAdminAccessRequestService({ repo: repo(), events: events(sink) })
    const result = await svc.reject(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1, {
      reason: 'This role does not need approval rights.',
    })
    expect(result.requesterUserId).toBe('u1')
    expect(sink.find((e) => e.type === 'admin_access_request.rejected')).toBeDefined()
  })

  it('emits nothing when a decision is refused', async () => {
    const sink: DomainEvent[] = []
    const svc = createAdminAccessRequestService({
      repo: repo({ findById: async () => makeRequest({ status: 'APPROVED' }) }),
      events: events(sink),
    })
    await expect(svc.approve(ctxFor(['ADMIN'], SUPER, 'super1'), 'req1', 1)).rejects.toThrow()
    expect(sink).toHaveLength(0)
  })
})

describe('canDecide', () => {
  it('is true only for the super administrator', () => {
    const svc = createAdminAccessRequestService({ repo: repo(), events: events() })
    expect(svc.canDecide(ctxFor(['ADMIN'], SUPER))).toBe(true)
    expect(svc.canDecide(ctxFor(['ADMIN'], 'other@triyara.test'))).toBe(false)
    expect(svc.canDecide(ctxFor(['READ_ONLY']))).toBe(false)
  })
})

describe('super admin configuration', () => {
  it('is a list from the outset, so Stage-2 is config not architecture', async () => {
    const { getSuperAdminEmails, parseSuperAdminEmails } = await import('../security/super-admin')
    expect(Array.isArray(getSuperAdminEmails())).toBe(true)
    expect(getSuperAdminEmails()).toContain(SUPER)
    expect(parseSuperAdminEmails(' A@x.com , b@Y.com ,, a@x.com ')).toEqual(['a@x.com', 'b@y.com'])
  })

  it('hands back a copy, so a caller cannot widen it', async () => {
    const { getSuperAdminEmails, isSuperAdmin } = await import('../security/super-admin')
    getSuperAdminEmails().push('attacker@evil.com')
    expect(isSuperAdmin('attacker@evil.com')).toBe(false)
  })
})
