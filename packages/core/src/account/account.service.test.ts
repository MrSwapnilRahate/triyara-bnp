import { buildAbilityFor, type Role } from '@triyara/auth'
import type { AccountListResult, AccountRecord, AccountRepository, MutateData } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { beforeEach, describe, expect, it } from 'vitest'

import { type AccountServiceCtx, createAccountService } from './account.service'

function ctxFor(roles: Role[]): AccountServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'req1' }
}

function makeAccount(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: 'acc1',
    organizationId: 'org1',
    legalName: 'Sunrise Agro',
    displayName: null,
    country: 'IN',
    relationshipStatus: 'PROSPECT',
    source: null,
    ownerId: null,
    createdById: 'u1',
    updatedById: 'u1',
    deletedById: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    owner: null,
    ...over,
  }
}

function fakeRepo(over: Partial<AccountRepository> = {}): AccountRepository {
  return {
    create: async () => makeAccount(),
    findById: async () => makeAccount(),
    findActiveByName: async () => null,
    list: async (): Promise<AccountListResult> => ({ items: [], nextCursor: null, hasMore: false }),
    mutate: async (_c, _id, _v, data: MutateData) => makeAccount(data as Partial<AccountRecord>),
    softDelete: async () => makeAccount({ deletedAt: new Date() }),
    restore: async () => makeAccount(),
    ...over,
  }
}

function spyBus() {
  const emitted: DomainEvent[] = []
  const bus: EventBus = {
    emit: async (e) => {
      emitted.push(e as DomainEvent)
    },
  }
  return { bus, emitted }
}

describe('account service', () => {
  let events: ReturnType<typeof spyBus>
  beforeEach(() => {
    events = spyBus()
  })

  it('READ_ONLY cannot create an account', async () => {
    const svc = createAccountService({ repo: fakeRepo(), events: events.bus })
    await expect(svc.create(ctxFor(['READ_ONLY']), { legalName: 'X Co' })).rejects.toThrow()
    expect(events.emitted).toHaveLength(0)
  })

  it('EXPORT_MANAGER create emits account.created', async () => {
    const svc = createAccountService({ repo: fakeRepo(), events: events.bus })
    const account = await svc.create(ctxFor(['EXPORT_MANAGER']), { legalName: 'Sunrise Agro' })
    expect(account.legalName).toBe('Sunrise Agro')
    expect(events.emitted.map((e) => e.type)).toEqual(['account.created'])
  })

  it('changeStatus out of BLACKLISTED is rejected (terminal)', async () => {
    const repo = fakeRepo({
      findById: async () => makeAccount({ relationshipStatus: 'BLACKLISTED' }),
    })
    const svc = createAccountService({ repo, events: events.bus })
    await expect(
      svc.changeStatus(ctxFor(['ADMIN']), 'acc1', { relationshipStatus: 'ACTIVE' }, 1),
    ).rejects.toThrow(/terminal/i)
  })

  it('bulk set_status reports partial success', async () => {
    const repo = fakeRepo({
      findById: async (_org, id) =>
        id === 'bad'
          ? makeAccount({ id: 'bad', relationshipStatus: 'BLACKLISTED' })
          : makeAccount({ id }),
    })
    const svc = createAccountService({ repo, events: events.bus })
    const res = await svc.bulk(ctxFor(['ADMIN']), {
      action: 'set_status',
      ids: ['good', 'bad'],
      payload: { relationshipStatus: 'ACTIVE' },
    })
    expect(res.summary).toEqual({ ok: 1, failed: 1 })
    expect(res.results.find((r) => r.id === 'bad')?.status).toBe('error')
  })
})
