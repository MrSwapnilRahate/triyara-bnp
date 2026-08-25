import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ForbiddenError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The portal's first write, at the boundary that guards it.
 *
 * The order of the first three calls is the security argument: authenticate,
 * resolve the party, rate limit - and only then look at what the browser sent.
 * A test that mocked all three would prove nothing about that order, so these
 * record call order and assert it.
 */

const requireAuth = vi.fn()
const resolve = vi.fn()
const enforceWriteLimit = vi.fn()
const submitRequirement = vi.fn()
const revalidatePath = vi.fn()
const order: string[] = []

vi.mock('@/auth/context', () => ({
  requireAuth: () => {
    order.push('requireAuth')
    return requireAuth()
  },
}))
vi.mock('@/lib/portal-context-service', () => ({
  portalContextService: {
    resolve: (ctx: unknown) => {
      order.push('resolve')
      return resolve(ctx)
    },
  },
}))
vi.mock('@/lib/api', () => ({
  enforceWriteLimit: (id: string) => {
    order.push('enforceWriteLimit')
    return enforceWriteLimit(id)
  },
}))
vi.mock('@/lib/buyer-portal-service', () => ({
  buyerPortalService: {
    submitRequirement: (party: unknown, dto: unknown) => {
      order.push('submitRequirement')
      return submitRequirement(party, dto)
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const { submitRequirementAction } = await import('../actions')

const PARTY = {
  userId: 'u1',
  accountId: 'acct-1',
  organizationId: 'org1',
  partyType: 'BUYER' as const,
  companyName: 'Nair Foods',
  country: 'AE',
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const VALID = { product: 'Sona Masoori rice', quantity: '2 x 20ft container' }

beforeEach(() => {
  order.length = 0
  requireAuth.mockReset().mockResolvedValue({ user: { id: 'u1' }, organizationId: 'org1' })
  resolve.mockReset().mockResolvedValue(PARTY)
  enforceWriteLimit.mockReset()
  revalidatePath.mockReset()
  submitRequirement
    .mockReset()
    .mockResolvedValue({ reference: 'QR-2026-000042', alreadySubmitted: false })
})

describe('the write happens only after identity is established', () => {
  it('authenticates, resolves and rate limits before writing', async () => {
    await submitRequirementAction({}, form(VALID))
    expect(order).toEqual(['requireAuth', 'resolve', 'enforceWriteLimit', 'submitRequirement'])
  })

  it('writes nothing when there is no session', async () => {
    requireAuth.mockRejectedValue(new Error('Not authenticated'))
    await expect(submitRequirementAction({}, form(VALID))).rejects.toThrow()
    expect(submitRequirement).not.toHaveBeenCalled()
  })

  it('writes nothing when the party is refused', async () => {
    // A supplier, an unapproved account, or somebody from another tenant.
    resolve.mockRejectedValue(new ForbiddenError('This portal is not available for your account.'))
    const state = await submitRequirementAction({}, form(VALID))
    expect(state.error).toMatch(/not available/i)
    expect(submitRequirement).not.toHaveBeenCalled()
  })

  it('rate limits against the resolved user, not anything the form said', async () => {
    await submitRequirementAction({}, form({ ...VALID, userId: 'someone-else' }))
    expect(enforceWriteLimit).toHaveBeenCalledWith('u1')
  })

  it('writes nothing when the rate limit refuses', async () => {
    enforceWriteLimit.mockImplementation(() => {
      throw new ForbiddenError('Too many requests.')
    })
    const state = await submitRequirementAction({}, form(VALID))
    expect(state.error).toBeTruthy()
    expect(submitRequirement).not.toHaveBeenCalled()
  })

  it('passes the resolved party to the service, not a constructed one', async () => {
    await submitRequirementAction({}, form(VALID))
    expect(submitRequirement).toHaveBeenCalledWith(PARTY, expect.anything())
  })
})

describe('only the requirement fields reach the service', () => {
  it('forwards what the buyer typed', async () => {
    await submitRequirementAction({}, form(VALID))
    expect(submitRequirement).toHaveBeenCalledWith(PARTY, {
      product: 'Sona Masoori rice',
      quantity: '2 x 20ft container',
    })
  })

  it.each([
    'organizationId',
    'buyerAccountId',
    'accountId',
    'contactName',
    'contactEmail',
    'source',
    'leadScore',
    'status',
    'reference',
    'createdById',
  ])('drops a smuggled %s rather than forwarding it', async (key) => {
    await submitRequirementAction({}, form({ ...VALID, [key]: 'attacker-value' }))
    const [, dto] = submitRequirement.mock.calls[0]!
    expect(dto).not.toHaveProperty(key)
    expect(JSON.stringify(dto)).not.toContain('attacker-value')
  })

  it('carries the optional fields through when given', async () => {
    await submitRequirementAction({}, form({ ...VALID, packaging: '25kg PP bags' }))
    const [, dto] = submitRequirement.mock.calls[0]!
    expect(dto).toMatchObject({ packaging: '25kg PP bags' })
  })

  it('omits blank optional fields rather than sending empty strings', async () => {
    await submitRequirementAction({}, form({ ...VALID, packaging: '   ' }))
    const [, dto] = submitRequirement.mock.calls[0]!
    expect(dto).not.toHaveProperty('packaging')
  })
})

describe('invalid input is refused without a partial write', () => {
  it.each([
    ['no product', { quantity: '2 containers' }],
    ['no quantity', { product: 'Rice' }],
    ['nothing at all', {}],
  ])('refuses %s', async (_label, fields) => {
    const state = await submitRequirementAction({}, form(fields as Record<string, string>))
    expect(state.error).toBeTruthy()
    expect(submitRequirement).not.toHaveBeenCalled()
  })

  it('names the fields that need attention', async () => {
    const state = await submitRequirementAction({}, form({ quantity: '2 containers' }))
    expect(state.fieldErrors?.product).toBeTruthy()
  })

  it('does not revalidate the list when nothing was written', async () => {
    await submitRequirementAction({}, form({}))
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('what the buyer is told afterwards', () => {
  it('returns the reference', async () => {
    const state = await submitRequirementAction({}, form(VALID))
    expect(state.reference).toBe('QR-2026-000042')
    expect(state.alreadySubmitted).toBe(false)
  })

  it('refreshes the requirements list so the new item shows', async () => {
    await submitRequirementAction({}, form(VALID))
    expect(revalidatePath).toHaveBeenCalledWith('/portal/requirements')
  })

  it('reports a repeat as already submitted rather than as a failure', async () => {
    submitRequirement.mockResolvedValue({ reference: 'QR-2026-000041', alreadySubmitted: true })
    const state = await submitRequirementAction({}, form(VALID))
    expect(state).toMatchObject({ reference: 'QR-2026-000041', alreadySubmitted: true })
    expect(state.error).toBeUndefined()
  })

  it('does not describe an internal failure to the caller', async () => {
    submitRequirement.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'))
    await expect(submitRequirementAction({}, form(VALID))).rejects.toThrow()
  })
})

/**
 * How this surface is allowed to reach data.
 *
 * Source-level, for the reason earlier batches established: an action that
 * authenticated some other way, or reached the RFQ service, would behave
 * identically until the day it mattered.
 */
describe('the action reaches data only through the sanctioned path', () => {
  const source = readFileSync(join(__dirname, '../actions.ts'), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('is a server action', () => {
    expect(source.startsWith("'use server'")).toBe(true)
  })

  it('establishes a session first', () => {
    expect(code).toContain('requireAuth()')
  })

  it('resolves the party before writing', () => {
    expect(code).toContain('portalContextService.resolve')
  })

  it('writes through the buyer portal service', () => {
    expect(code).toContain('buyerPortalService.submitRequirement')
  })

  it('never creates an RFQ', () => {
    // The boundary the whole batch exists to hold.
    expect(code).not.toContain('rfqService')
    expect(code).not.toContain('rfqRepository')
    expect(code).not.toContain('RFQ')
  })

  it('does not use the public config-based intake path', () => {
    expect(code).not.toContain('quoteRequestService')
    expect(code).not.toContain('publicQuoteRequestSchema')
  })

  it('imports no repository or database package', () => {
    expect(code).not.toContain('@triyara/db')
    expect(code).not.toContain('prisma')
  })

  it('enforces the authenticated write limit', () => {
    expect(code).toContain('enforceWriteLimit(party.userId)')
  })

  it('validates with the strict portal schema', () => {
    expect(code).toContain('portalRequirementSchema')
  })

  it('names no ownership or identity field it could forward', () => {
    for (const key of ['organizationId:', 'buyerAccountId', 'contactEmail', 'contactName']) {
      expect(code).not.toContain(key)
    }
  })
})
