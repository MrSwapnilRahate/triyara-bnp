import { describe, expect, it, vi } from 'vitest'

import { FREIGHT_RATE_UNRESOLVED_MESSAGE, resolveFreightRate } from './freight-rate-resolver'

/**
 * Which rate applies, and why none does.
 *
 * The rule this exists to enforce is that resolution NEVER picks arbitrarily.
 * V3.4 is what makes a cost explainable, and "the first row that came back" is
 * not an explanation - so every failure below has its own named reason rather
 * than collapsing into a null.
 */

const RATE = {
  id: 'f1',
  organizationId: 'org1',
  originPortId: 'p-in',
  destinationPortId: 'p-ae',
  mode: 'SEA_FCL',
  containerTypeId: 'c-20',
  amount: '1850.0000',
  currency: 'USD',
}

/** Captures the params so the tenant and filter assertions can read them. */
function repoWith(items: unknown[]) {
  return {
    list: vi.fn(async (_p?: Record<string, unknown>) => ({
      items,
      nextCursor: null,
      hasMore: false,
    })),
  }
}

const base = {
  organizationId: 'org1',
  originPortId: 'p-in',
  destinationPortId: 'p-ae',
  mode: 'SEA_FCL',
  containerTypeId: 'c-20',
  effectiveAt: new Date('2027-03-01'),
}

const resolve = (repo: ReturnType<typeof repoWith>, over: Record<string, unknown> = {}) =>
  resolveFreightRate(repo as never, { ...base, ...over } as never)

describe('a match', () => {
  it('resolves the single rate for the corridor', async () => {
    const repo = repoWith([RATE])
    const result = await resolve(repo)
    expect(result).toEqual({ status: 'RESOLVED', rate: RATE })
  })

  it('queries by the whole key, not a subset', async () => {
    const repo = repoWith([RATE])
    await resolve(repo)
    const p = repo.list.mock.calls[0]![0]!
    expect(p.organizationId).toBe('org1')
    expect(p.originPortId).toBe('p-in')
    expect(p.destinationPortId).toBe('p-ae')
    expect(p.mode).toBe('SEA_FCL')
    expect(p.containerTypeId).toBe('c-20')
    expect(p.effectiveOn).toEqual(new Date('2027-03-01'))
  })

  it('never queries without an organization', async () => {
    // A rate is a negotiated commercial term. A lookup missing this would read
    // another tenant's price.
    const repo = repoWith([RATE])
    await resolve(repo)
    expect(repo.list.mock.calls[0]![0]!.organizationId).toBe('org1')
  })
})

describe('preconditions are reported individually', () => {
  it.each([
    ['MISSING_PORTS', { originPortId: null }],
    ['MISSING_PORTS', { destinationPortId: null }],
    ['MISSING_MODE', { mode: null }],
    ['MISSING_EFFECTIVE_DATE', { effectiveAt: null }],
  ])('reports %s', async (reason, over) => {
    const repo = repoWith([RATE])
    const result = await resolve(repo, over)
    expect(result).toEqual({ status: 'UNRESOLVED', reason })
    // Refused before the query: an incomplete scenario is not an unpriced one.
    expect(repo.list).not.toHaveBeenCalled()
  })

  it('does not default a missing date to today', async () => {
    // The decision ADR-0012 forces: resolving against now() would make the same
    // scenario pick a different rate next month, silently.
    const repo = repoWith([RATE])
    const result = await resolve(repo, { effectiveAt: null })
    expect(result).toMatchObject({ reason: 'MISSING_EFFECTIVE_DATE' })
    expect(repo.list).not.toHaveBeenCalled()
  })

  it('gives every reason a human explanation', () => {
    for (const [reason, message] of Object.entries(FREIGHT_RATE_UNRESOLVED_MESSAGE)) {
      expect(message.length, reason).toBeGreaterThan(10)
    }
  })
})

describe('container and mode must agree - the V3.3 rules', () => {
  it('refuses SEA_FCL with no container', async () => {
    const repo = repoWith([RATE])
    expect(await resolve(repo, { containerTypeId: null })).toEqual({
      status: 'UNRESOLVED',
      reason: 'CONTAINER_MODE_MISMATCH',
    })
    expect(repo.list).not.toHaveBeenCalled()
  })

  it.each(['SEA_LCL', 'AIR', 'ROAD', 'RAIL'])('refuses %s carrying a container', async (mode) => {
    const repo = repoWith([RATE])
    expect(await resolve(repo, { mode, containerTypeId: 'c-20' })).toEqual({
      status: 'UNRESOLVED',
      reason: 'CONTAINER_MODE_MISMATCH',
    })
    expect(repo.list).not.toHaveBeenCalled()
  })

  it.each(['SEA_LCL', 'AIR', 'ROAD', 'RAIL'])('resolves %s with no container', async (mode) => {
    const rate = { ...RATE, mode, containerTypeId: null }
    const repo = repoWith([rate])
    expect(await resolve(repo, { mode, containerTypeId: null })).toEqual({
      status: 'RESOLVED',
      rate,
    })
  })

  it('allows MULTIMODAL either way', async () => {
    // Neither containerised nor non-containerised: a leg may or may not be.
    const withBox = { ...RATE, mode: 'MULTIMODAL' }
    expect(
      await resolve(repoWith([withBox]), { mode: 'MULTIMODAL', containerTypeId: 'c-20' }),
    ).toMatchObject({ status: 'RESOLVED' })

    const without = { ...RATE, mode: 'MULTIMODAL', containerTypeId: null }
    expect(
      await resolve(repoWith([without]), { mode: 'MULTIMODAL', containerTypeId: null }),
    ).toMatchObject({ status: 'RESOLVED' })
  })

  it('does not let a non-containerised lookup match a rate carrying a container', async () => {
    // The repository only narrows by container when one is passed, so the shape
    // is confirmed here rather than assumed.
    const repo = repoWith([{ ...RATE, mode: 'AIR', containerTypeId: 'c-20' }])
    expect(await resolve(repo, { mode: 'AIR', containerTypeId: null })).toEqual({
      status: 'UNRESOLVED',
      reason: 'NO_RATE',
    })
  })

  it('does not let a container lookup match a different container', async () => {
    const repo = repoWith([{ ...RATE, containerTypeId: 'c-40' }])
    expect(await resolve(repo, { containerTypeId: 'c-20' })).toEqual({
      status: 'UNRESOLVED',
      reason: 'NO_RATE',
    })
  })
})

describe('no match and too many matches', () => {
  it('reports NO_RATE when the corridor is simply unpriced', async () => {
    // An ordinary state of the world, not an error - so nothing throws.
    const repo = repoWith([])
    await expect(resolve(repo)).resolves.toEqual({ status: 'UNRESOLVED', reason: 'NO_RATE' })
  })

  it('refuses to choose when more than one matches', async () => {
    // The V3.3 exclusion constraint makes this unreachable through the API, so
    // reaching it means rows were written around the constraint. Picking one
    // anyway would hide that, and produce a cost nobody can account for.
    const repo = repoWith([RATE, { ...RATE, id: 'f2', amount: '9999.0000' }])
    expect(await resolve(repo)).toEqual({
      status: 'UNRESOLVED',
      reason: 'AMBIGUOUS',
      candidates: 2,
    })
  })

  it('never returns the first of several', async () => {
    const repo = repoWith([RATE, { ...RATE, id: 'f2' }])
    const result = await resolve(repo)
    expect(result.status).toBe('UNRESOLVED')
    expect(JSON.stringify(result)).not.toContain('"amount"')
  })
})

describe('tenant isolation', () => {
  it('passes the caller organization through, whatever it is', async () => {
    const repo = repoWith([RATE])
    await resolve(repo, { organizationId: 'org2' })
    expect(repo.list.mock.calls[0]![0]!.organizationId).toBe('org2')
  })

  it('cannot be asked for a rate without naming an organization', async () => {
    // The input type requires it; this pins the runtime behaviour too - an
    // empty tenant must reach the repository as-is and match nothing, never be
    // dropped from the filter.
    const repo = repoWith([])
    await resolve(repo, { organizationId: '' })
    expect(repo.list.mock.calls[0]![0]).toHaveProperty('organizationId', '')
  })
})
