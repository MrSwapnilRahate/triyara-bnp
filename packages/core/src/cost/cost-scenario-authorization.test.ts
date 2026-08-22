import {
  type Action,
  type AppAbility,
  buildAbilityFor,
  type Role,
  type Subject,
} from '@triyara/auth'
import type { EventBus } from '@triyara/events'
import { describe, expect, it, vi } from 'vitest'

import { createCostScenarioService } from './cost-scenario.service'

/**
 * Who may work with a cost scenario.
 *
 * `CostScenario` is a NEW subject rather than a reuse of `Quotation` (ADR-0012),
 * so nothing about this matrix is inherited - every answer below comes from the
 * grant added alongside it, and these pin it against accidental widening.
 *
 * The one place it departs from the RFQ/Quotation rule is `delete`: an export
 * manager may discard their own working calculation, because a scenario is not
 * a commercial commitment. Withdrawing a quotation a buyer has seen still is.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']
const NOT_PERMITTED = /not permitted/i
const fakeEvents = () => ({ emit: async () => undefined }) as unknown as EventBus

const record = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  organizationId: 'org1',
  version: 2,
  name: 'FOB Nhava Sheva',
  productId: 'p1',
  currency: 'USD',
  baseCurrency: 'USD',
  fxRate: null,
  deletedAt: null,
  charges: [],
  ...over,
})

/** Parameters are declared so `mock.calls[n][i]` is typed - the V3.4 tests read them. */
function repoStub() {
  type Data = Record<string, unknown>
  return {
    create: vi.fn(async (_ctx?: Data, _data?: Data) => record()),
    findById: vi.fn(async (_org?: string, _id?: string, _opts?: Data) => record()),
    list: vi.fn(async (_p?: Data) => ({ items: [], nextCursor: null, hasMore: false })),
    update: vi.fn(async (_ctx?: Data, _id?: string, _v?: number, _data?: Data) => record()),
    softDelete: vi.fn(async () => record({ deletedAt: new Date() })),
    restore: vi.fn(async () => record()),
  }
}

function svc(repo: ReturnType<typeof repoStub>) {
  return createCostScenarioService({ repo: repo as never, events: fakeEvents() })
}

function ctxFor(roles: Role[]) {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

const dto = {
  name: 'FOB Nhava Sheva',
  productId: 'p1',
  quantity: '12500',
  unit: 'KG',
  incoterm: 'FOB' as const,
  unitCost: '3.4700',
  currency: 'USD',
  baseCurrency: 'USD',
}

/** action -> [who may, how to call it, which repo method must not run] */
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
    call: (s: ReturnType<typeof svc>, c: never) => s.update(c, 's1', 2, { name: 'x' } as never),
    guarded: 'update' as const,
  },
  {
    name: 'delete',
    allowed: ['ADMIN', 'EXPORT_MANAGER'] as Role[],
    call: (s: ReturnType<typeof svc>, c: never) => s.remove(c, 's1', 2),
    guarded: 'softDelete' as const,
  },
  {
    name: 'restore',
    allowed: ['ADMIN', 'EXPORT_MANAGER'] as Role[],
    call: (s: ReturnType<typeof svc>, c: never) => s.restore(c, 's1', 2),
    guarded: 'restore' as const,
  },
  {
    name: 'read',
    allowed: ROLES,
    call: (s: ReturnType<typeof svc>, c: never) => s.get(c, 's1'),
    guarded: 'findById' as const,
  },
  {
    name: 'list',
    allowed: ROLES,
    call: (s: ReturnType<typeof svc>, c: never) => s.list(c, { limit: 25 } as never),
    guarded: 'list' as const,
  },
] as const

describe.each(CASES)('$name', ({ allowed, call, guarded }) => {
  it.each(ROLES)('%s', async (role) => {
    const repo = repoStub()
    const may = allowed.includes(role)
    const promise = call(svc(repo), ctxFor([role]) as never)

    if (may) {
      await expect(promise).resolves.toBeDefined()
      expect(repo[guarded]).toHaveBeenCalled()
    } else {
      await expect(promise).rejects.toThrow(NOT_PERMITTED)
      // Refused BEFORE the repository runs: a denied caller leaves no trace.
      expect(repo[guarded]).not.toHaveBeenCalled()
    }
  })
})

describe('the grant is deliberate, not inherited', () => {
  it('lets an export manager delete a scenario but not an RFQ or quotation', () => {
    // The single intentional departure from the RFQ/Quotation rule.
    const em = buildAbilityFor(['EXPORT_MANAGER'])
    expect(em.can('delete', 'CostScenario')).toBe(true)
    expect(em.can('delete', 'RFQ')).toBe(false)
    expect(em.can('delete', 'Quotation')).toBe(false)
    expect(em.can('manage', 'CostScenario')).toBe(false)
  })

  it('keeps VERIFIER and READ_ONLY unable to write', () => {
    for (const role of ['VERIFIER', 'READ_ONLY'] as Role[]) {
      const a = buildAbilityFor([role])
      expect(a.can('read', 'CostScenario')).toBe(true)
      for (const action of ['create', 'update', 'delete', 'manage'] as Action[]) {
        expect(a.can(action, 'CostScenario'), `${role} ${action}`).toBe(false)
      }
    }
  })

  it('did not widen any existing subject', () => {
    // Adding CostScenario must not have changed a single answer elsewhere.
    const em = buildAbilityFor(['EXPORT_MANAGER'])
    expect(em.can('create', 'RFQ')).toBe(true)
    expect(em.can('update', 'Quotation')).toBe(true)
    expect(em.can('delete', 'Supplier')).toBe(false)
    expect(em.can('update', 'Product')).toBe(false)
    expect(em.can('manage', 'AuditLog')).toBe(false)
    expect(buildAbilityFor(['VERIFIER']).can('verify', 'Verification')).toBe(true)
  })

  it('reaches ADMIN through manage all, not a rule of its own', () => {
    const admin = buildAbilityFor(['ADMIN'])
    for (const action of ['create', 'read', 'update', 'delete', 'manage'] as Action[]) {
      expect(admin.can(action, 'CostScenario')).toBe(true)
    }
  })
})

describe('the service asks about its own subject', () => {
  /** An actor holding every action on exactly the subjects named. */
  const only = (...held: Subject[]) => {
    const ability = { can: (_a: Action, s: Subject) => held.includes(s) } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    return { user, organizationId: 'org1', ability, requestId: 'r1' }
  }

  it.each(CASES)('$name refuses an actor holding only Quotation', async ({ call }) => {
    // Every configured role answers identically across CostScenario and
    // Quotation for `create`/`update`, so only a hand-built actor can prove the
    // service consults its own subject rather than the quotation one.
    await expect(call(svc(repoStub()), only('Quotation') as never)).rejects.toThrow(NOT_PERMITTED)
  })

  it.each(CASES)('$name accepts an actor holding only CostScenario', async ({ call }) => {
    await expect(call(svc(repoStub()), only('CostScenario') as never)).resolves.toBeDefined()
  })
})

describe('restore is authorized as an edit', () => {
  it('needs update, not delete', async () => {
    const ability = {
      can: (a: Action, s: Subject) => s === 'CostScenario' && a !== 'update',
    } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    const ctx = { user, organizationId: 'org1', ability, requestId: 'r1' }
    const repo = repoStub()

    await expect(svc(repo).restore(ctx as never, 's1', 2)).rejects.toThrow(NOT_PERMITTED)
    expect(repo.restore).not.toHaveBeenCalled()
  })
})

describe('an exchange rate is required when currencies differ', () => {
  it('refuses a foreign-currency scenario with no rate', async () => {
    const repo = repoStub()
    await expect(
      svc(repo).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          currency: 'USD',
          baseCurrency: 'INR',
        } as never,
      ),
    ).rejects.toThrow(/exchange rate is required/i)
    // Refused before any write - a silent rate of 1 would report a USD total
    // as if it were INR, and nothing downstream could detect it.
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('accepts one that carries a rate', async () => {
    const repo = repoStub()
    await expect(
      svc(repo).create(
        ctxFor(['ADMIN']) as never,
        {
          ...dto,
          currency: 'USD',
          baseCurrency: 'INR',
          fxRate: '83.25000000',
        } as never,
      ),
    ).resolves.toBeDefined()
  })

  it('judges an update against the stored record, not the patch alone', async () => {
    // Changing only the currency must be caught even though the patch carries
    // no baseCurrency of its own.
    const repo = repoStub()
    repo.findById.mockResolvedValue(record({ currency: 'INR', baseCurrency: 'INR', fxRate: null }))

    await expect(
      svc(repo).update(ctxFor(['ADMIN']) as never, 's1', 2, { currency: 'USD' } as never),
    ).rejects.toThrow(/exchange rate is required/i)
    expect(repo.update).not.toHaveBeenCalled()
  })
})

describe('freight resolution on a scenario (V3.4)', () => {
  const port = { id: 'p-in', locode: 'INNSA', name: 'Nhava Sheva', countryCode: 'IN', modes: [] }

  function deps(over: Record<string, unknown> = {}) {
    const repo = repoStub()
    const freightRates = {
      list: vi.fn(async (_p?: Record<string, unknown>) => ({
        items: [{ id: 'f1', amount: '1850.0000', containerTypeId: 'c-20' }],
        nextCursor: null,
        hasMore: false,
      })),
    }
    const logistics = {
      findPortByLocode: vi.fn(async (_code: string) => port),
      listPorts: vi.fn(async () => [port]),
      listContainerTypes: vi.fn(async () => []),
    }
    return { repo, freightRates, logistics, ...over }
  }

  const build = (d: ReturnType<typeof deps>) =>
    createCostScenarioService({
      repo: d.repo as never,
      events: fakeEvents(),
      freightRates: d.freightRates as never,
      logistics: d.logistics as never,
    })

  const resolvable = {
    originPortId: 'p-in',
    destinationPortId: 'p-ae',
    mode: 'SEA_FCL',
    containerTypeId: 'c-20',
    ratesEffectiveOn: new Date('2027-03-01'),
  }

  it('resolves the rate for a fully specified scenario', async () => {
    const d = deps()
    d.repo.findById.mockResolvedValue(record(resolvable))
    const result = await build(d).resolveFreight(ctxFor(['ADMIN']) as never, 's1')
    expect(result).toMatchObject({ status: 'RESOLVED' })
  })

  it('looks the rate up in the CALLER organization, never one carried on the row', async () => {
    // The scenario is fetched tenant-scoped, so the two agree - but the lookup
    // must be keyed by the caller's context, which is the value a request can
    // be trusted to have authenticated.
    const d = deps()
    d.repo.findById.mockResolvedValue(record(resolvable))
    await build(d).resolveFreight(ctxFor(['ADMIN']) as never, 's1')
    expect(d.freightRates.list.mock.calls[0]![0]!.organizationId).toBe('org1')
    // ...and the scenario itself was read tenant-scoped in the first place.
    expect(d.repo.findById).toHaveBeenCalledWith('org1', 's1')
  })

  it.each(ROLES)('%s may resolve - reading a rate is reading a rate', async (role) => {
    const d = deps()
    d.repo.findById.mockResolvedValue(record(resolvable))
    await expect(build(d).resolveFreight(ctxFor([role]) as never, 's1')).resolves.toBeDefined()
  })

  it('needs BOTH read CostScenario and read FreightRate', async () => {
    const holding = (subject: Subject) =>
      ({
        can: (_a: Action, s: Subject) => s === subject,
      }) as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }

    for (const subject of ['CostScenario', 'FreightRate'] as Subject[]) {
      const d = deps()
      d.repo.findById.mockResolvedValue(record(resolvable))
      await expect(
        build(d).resolveFreight(
          { user, organizationId: 'org1', ability: holding(subject) } as never,
          's1',
        ),
      ).rejects.toThrow(NOT_PERMITTED)
    }
  })

  it('reports why, rather than returning nothing, when the scenario is incomplete', async () => {
    const d = deps()
    d.repo.findById.mockResolvedValue(record({ ...resolvable, ratesEffectiveOn: null }))
    expect(await build(d).resolveFreight(ctxFor(['ADMIN']) as never, 's1')).toEqual({
      status: 'UNRESOLVED',
      reason: 'MISSING_EFFECTIVE_DATE',
    })
  })

  it('never writes a charge - a rate is reference data (ADR-0012)', async () => {
    const d = deps()
    d.repo.findById.mockResolvedValue(record(resolvable))
    await build(d).resolveFreight(ctxFor(['ADMIN']) as never, 's1')
    expect(d.repo.update).not.toHaveBeenCalled()
    expect(d.repo.create).not.toHaveBeenCalled()
  })
})

describe('LOCODE to Port resolution (V3.4)', () => {
  const port = {
    id: 'p-resolved',
    locode: 'INNSA',
    name: 'Nhava Sheva',
    countryCode: 'IN',
    modes: [],
  }

  function build(findPortByLocode: ReturnType<typeof vi.fn>) {
    const repo = repoStub()
    const logistics = { findPortByLocode, listPorts: vi.fn(), listContainerTypes: vi.fn() }
    const svc = createCostScenarioService({
      repo: repo as never,
      events: fakeEvents(),
      logistics: logistics as never,
    })
    return { repo, svc, logistics }
  }

  it('fills a Port id from a LOCODE when one is curated', async () => {
    const { repo, svc } = build(vi.fn(async () => port))
    await svc.create(ctxFor(['ADMIN']) as never, { ...dto, originLocode: 'INNSA' } as never)
    expect(repo.create.mock.calls[0]![1]!.originPortId).toBe('p-resolved')
  })

  it('NEVER overwrites a Port id the caller supplied', async () => {
    // An explicit choice wins over a code that happens to be present.
    const findPort = vi.fn(async () => port)
    const { repo, svc } = build(findPort)
    await svc.create(
      ctxFor(['ADMIN']) as never,
      {
        ...dto,
        originLocode: 'INNSA',
        originPortId: 'chosen-by-caller',
      } as never,
    )
    expect(repo.create.mock.calls[0]![1]!.originPortId).toBe('chosen-by-caller')
    expect(findPort).not.toHaveBeenCalled()
  })

  it('leaves an unknown LOCODE alone rather than rejecting it', async () => {
    // V3.3 kept the code columns precisely so an uncurated corridor still works.
    const { repo, svc } = build(vi.fn(async () => null))
    await svc.create(ctxFor(['ADMIN']) as never, { ...dto, originLocode: 'ZZZZZ' } as never)
    expect(repo.create.mock.calls[0]![1]!.originPortId).toBeUndefined()
    expect(repo.create).toHaveBeenCalled()
  })

  it('resolves on update too, and still respects an explicit id', async () => {
    const findPort = vi.fn(async () => port)
    const { repo, svc } = build(findPort)
    await svc.update(ctxFor(['ADMIN']) as never, 's1', 2, {
      destinationLocode: 'INNSA',
    } as never)
    expect(repo.update.mock.calls[0]![3]!.destinationPortId).toBe('p-resolved')
  })
})
