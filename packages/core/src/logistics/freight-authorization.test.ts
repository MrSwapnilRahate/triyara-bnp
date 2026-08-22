import {
  type Action,
  type AppAbility,
  buildAbilityFor,
  type Role,
  type Subject,
} from '@triyara/auth'
import type { EventBus } from '@triyara/events'
import { describe, expect, it, vi } from 'vitest'

import { createFreightRateService, createLogisticsReferenceService } from './freight-rate.service'

/**
 * Who may read a port, and who may record a rate.
 *
 * The split is the whole design (ADR-0012): Port and ContainerType are global
 * facts governed by the existing `ReferenceData` subject, while FreightRate is
 * this tenant's commercial term and gets its own. Filing rates under
 * ReferenceData would have made recording a negotiated price an administrative
 * act, which is not how a trade desk works.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']
const NOT_PERMITTED = /not permitted/i
const fakeEvents = () => ({ emit: async () => undefined }) as unknown as EventBus

const PORTS = [
  {
    id: 'p-in',
    locode: 'INNSA',
    name: 'Nhava Sheva',
    countryCode: 'IN',
    modes: ['SEA_FCL', 'SEA_LCL'],
    isActive: true,
  },
  {
    id: 'p-ae',
    locode: 'AEJEA',
    name: 'Jebel Ali',
    countryCode: 'AE',
    modes: ['SEA_FCL', 'SEA_LCL'],
    isActive: true,
  },
  {
    id: 'p-air',
    locode: 'INDEL',
    name: 'Delhi',
    countryCode: 'IN',
    modes: ['AIR'],
    isActive: true,
  },
]

const rate = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  organizationId: 'org1',
  originPortId: 'p-in',
  destinationPortId: 'p-ae',
  mode: 'SEA_FCL',
  containerTypeId: 'c-20gp',
  amount: '1850.0000',
  currency: 'USD',
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  version: 2,
  deletedAt: null,
  ...over,
})

function repoStub() {
  return {
    create: vi.fn(async () => rate()),
    findById: vi.fn(async () => rate()),
    list: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    update: vi.fn(async () => rate()),
    softDelete: vi.fn(async () => rate({ deletedAt: new Date() })),
    restore: vi.fn(async () => rate()),
  }
}

const referenceStub = () => ({
  // The parameter is declared so `mock.calls[0][0]` is typed - the
  // organization-scope assertion below reads it.
  listPorts: vi.fn(async (_params?: Record<string, unknown>) => PORTS),
  listContainerTypes: vi.fn(async () => [{ id: 'c-20gp', code: '20GP' }]),
  findPortByLocode: vi.fn(async () => PORTS[0]),
})

function svc(repo: ReturnType<typeof repoStub>, reference = referenceStub()) {
  return createFreightRateService({
    repo: repo as never,
    reference: reference as never,
    events: fakeEvents(),
  })
}

const refSvc = (reference = referenceStub()) =>
  createLogisticsReferenceService({ repo: reference as never })

function ctxFor(roles: Role[]) {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

const dto = {
  originPortId: 'p-in',
  destinationPortId: 'p-ae',
  mode: 'SEA_FCL' as const,
  containerTypeId: 'c-20gp',
  amount: '1850.0000',
  currency: 'USD',
  effectiveFrom: new Date('2026-01-01'),
}

const CASES = [
  {
    name: 'create',
    allowed: ['ADMIN', 'EXPORT_MANAGER'] as Role[],
    call: (s: ReturnType<typeof svc>, c: never) => s.create(c, dto as never),
    guarded: 'create' as const,
  },
  {
    name: 'update',
    allowed: ['ADMIN', 'EXPORT_MANAGER'] as Role[],
    call: (s: ReturnType<typeof svc>, c: never) =>
      s.update(c, 'f1', 2, { amount: '1900' } as never),
    guarded: 'update' as const,
  },
  {
    name: 'delete',
    allowed: ['ADMIN', 'EXPORT_MANAGER'] as Role[],
    call: (s: ReturnType<typeof svc>, c: never) => s.remove(c, 'f1', 2),
    guarded: 'softDelete' as const,
  },
  {
    name: 'restore',
    allowed: ['ADMIN', 'EXPORT_MANAGER'] as Role[],
    call: (s: ReturnType<typeof svc>, c: never) => s.restore(c, 'f1', 2),
    guarded: 'restore' as const,
  },
  {
    name: 'read',
    allowed: ROLES,
    call: (s: ReturnType<typeof svc>, c: never) => s.get(c, 'f1'),
    guarded: 'findById' as const,
  },
  {
    name: 'list',
    allowed: ROLES,
    call: (s: ReturnType<typeof svc>, c: never) => s.list(c, { limit: 25 } as never),
    guarded: 'list' as const,
  },
] as const

describe.each(CASES)('freight rate $name', ({ allowed, call, guarded }) => {
  it.each(ROLES)('%s', async (role) => {
    const repo = repoStub()
    const may = allowed.includes(role)
    const promise = call(svc(repo), ctxFor([role]) as never)

    if (may) {
      await expect(promise).resolves.toBeDefined()
      expect(repo[guarded]).toHaveBeenCalled()
    } else {
      await expect(promise).rejects.toThrow(NOT_PERMITTED)
      expect(repo[guarded]).not.toHaveBeenCalled()
    }
  })
})

describe('global reference data is readable by every role', () => {
  it.each(ROLES)('%s may list ports and container types', async (role) => {
    const s = refSvc()
    await expect(s.listPorts(ctxFor([role]) as never, {} as never)).resolves.toBeDefined()
    await expect(s.listContainerTypes(ctxFor([role]) as never, {} as never)).resolves.toBeDefined()
  })

  it('is authorized as ReferenceData, not as FreightRate', async () => {
    // An actor holding FreightRate but NOT ReferenceData must still be refused,
    // which is what proves the two are separate permissions rather than one.
    const ability = {
      can: (_a: Action, s: Subject) => s === 'FreightRate',
    } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    const ctx = { user, organizationId: 'org1', ability, requestId: 'r1' }
    await expect(refSvc().listPorts(ctx as never, {} as never)).rejects.toThrow(NOT_PERMITTED)
  })

  it('does not take an organization scope', async () => {
    // Ports are global. If a tenant id ever reached the repository, two tenants
    // could disagree about what INNSA means.
    const reference = referenceStub()
    await refSvc(reference).listPorts(ctxFor(['READ_ONLY']) as never, {} as never)
    const args = reference.listPorts.mock.calls[0]?.[0] ?? {}
    expect(Object.keys(args)).not.toContain('organizationId')
  })
})

describe('the grant is deliberate', () => {
  it('gives an export manager the whole life of a rate', () => {
    const em = buildAbilityFor(['EXPORT_MANAGER'])
    for (const action of ['create', 'read', 'update', 'delete'] as Action[]) {
      expect(em.can(action, 'FreightRate'), action).toBe(true)
    }
    expect(em.can('manage', 'FreightRate')).toBe(false)
  })

  it('keeps VERIFIER and READ_ONLY unable to write a rate', () => {
    for (const role of ['VERIFIER', 'READ_ONLY'] as Role[]) {
      const a = buildAbilityFor([role])
      expect(a.can('read', 'FreightRate')).toBe(true)
      for (const action of ['create', 'update', 'delete', 'manage'] as Action[]) {
        expect(a.can(action, 'FreightRate'), `${role} ${action}`).toBe(false)
      }
    }
  })

  it('did not widen any existing subject', () => {
    const em = buildAbilityFor(['EXPORT_MANAGER'])
    expect(em.can('create', 'RFQ')).toBe(true)
    expect(em.can('delete', 'RFQ')).toBe(false)
    expect(em.can('delete', 'Quotation')).toBe(false)
    expect(em.can('delete', 'Supplier')).toBe(false)
    expect(em.can('update', 'Product')).toBe(false)
    expect(em.can('update', 'ReferenceData')).toBe(false)
    expect(em.can('manage', 'AuditLog')).toBe(false)
    expect(em.can('delete', 'CostScenario')).toBe(true) // V3.2, unchanged
    expect(buildAbilityFor(['VERIFIER']).can('verify', 'Verification')).toBe(true)
  })
})

describe('the service asks about its own subject', () => {
  const only = (...held: Subject[]) => {
    const ability = { can: (_a: Action, s: Subject) => held.includes(s) } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    return { user, organizationId: 'org1', ability, requestId: 'r1' }
  }

  it.each(CASES)('$name refuses an actor holding only ReferenceData', async ({ call }) => {
    await expect(call(svc(repoStub()), only('ReferenceData') as never)).rejects.toThrow(
      NOT_PERMITTED,
    )
  })

  it.each(CASES)('$name accepts an actor holding only FreightRate', async ({ call }) => {
    await expect(call(svc(repoStub()), only('FreightRate') as never)).resolves.toBeDefined()
  })

  it('restore needs update, not delete', async () => {
    const ability = {
      can: (a: Action, s: Subject) => s === 'FreightRate' && a !== 'update',
    } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    const repo = repoStub()
    await expect(
      svc(repo).restore({ user, organizationId: 'org1', ability } as never, 'f1', 2),
    ).rejects.toThrow(NOT_PERMITTED)
    expect(repo.restore).not.toHaveBeenCalled()
  })
})

describe('mode and container must agree', () => {
  it('refuses SEA_FCL with no container type', async () => {
    const repo = repoStub()
    await expect(
      svc(repo).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          containerTypeId: undefined,
        } as never,
      ),
    ).rejects.toThrow(/container type is required/i)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it.each(['SEA_LCL', 'AIR', 'ROAD', 'RAIL'])(
    'refuses %s carrying a container type',
    async (mode) => {
      const repo = repoStub()
      await expect(
        svc(repo).create(
          ctxFor(['ADMIN']) as never,
          {
            ...dto,
            mode,
            originPortId: mode === 'AIR' ? 'p-air' : 'p-in',
            containerTypeId: 'c-20gp',
          } as never,
        ),
      ).rejects.toThrow(/does not carry a container type/i)
      expect(repo.create).not.toHaveBeenCalled()
    },
  )

  it('allows MULTIMODAL either way - a leg may or may not be containerised', async () => {
    await expect(
      svc(repoStub()).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          mode: 'MULTIMODAL',
          containerTypeId: null,
        } as never,
      ),
    ).resolves.toBeDefined()
  })

  it('judges an update against the MERGED record, not the patch alone', async () => {
    // The stored row is SEA_FCL with a container; switching the mode to AIR
    // must be refused even though the patch names no container.
    const repo = repoStub()
    repo.findById.mockResolvedValue(rate({ mode: 'SEA_FCL', containerTypeId: 'c-20gp' }))
    await expect(
      svc(repo).update(ctxFor(['ADMIN']) as never, 'f1', 2, { mode: 'AIR' } as never),
    ).rejects.toThrow(/does not carry a container type/i)
    expect(repo.update).not.toHaveBeenCalled()
  })
})

describe('a port must serve the mode quoted against it', () => {
  it('refuses an air rate from a sea-only port', async () => {
    const repo = repoStub()
    await expect(
      svc(repo).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          mode: 'AIR',
          containerTypeId: null,
          originPortId: 'p-in', // sea only
        } as never,
      ),
    ).rejects.toThrow(/does not serve AIR/i)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('refuses an air rate whose DESTINATION is sea-only', async () => {
    // Both ends are checked, not just the origin.
    await expect(
      svc(repoStub()).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          mode: 'AIR',
          containerTypeId: null,
          originPortId: 'p-air',
          destinationPortId: 'p-ae',
        } as never,
      ),
    ).rejects.toThrow(/does not serve AIR/i)
  })

  it('accepts an air rate when both ends are airports', async () => {
    const reference = referenceStub()
    reference.listPorts.mockResolvedValue([
      ...PORTS,
      {
        id: 'p-air2',
        locode: 'AEDXB',
        name: 'Dubai',
        countryCode: 'AE',
        modes: ['AIR'],
        isActive: true,
      },
    ])
    await expect(
      svc(repoStub(), reference).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          mode: 'AIR',
          containerTypeId: null,
          originPortId: 'p-air',
          destinationPortId: 'p-air2',
        } as never,
      ),
    ).resolves.toBeDefined()
  })

  it('exempts MULTIMODAL, which spans legs a port serves individually', async () => {
    await expect(
      svc(repoStub()).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          mode: 'MULTIMODAL',
          containerTypeId: null,
        } as never,
      ),
    ).resolves.toBeDefined()
  })
})
