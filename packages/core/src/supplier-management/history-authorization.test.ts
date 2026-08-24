import {
  type Action,
  type AppAbility,
  buildAbilityFor,
  type Role,
  type Subject,
} from '@triyara/auth'
import { NotFoundError } from '@triyara/lib'
import { describe, expect, it, vi } from 'vitest'

import { createSupplierMatchingService, type MatchingCtx } from './supplier-matching.service'

/**
 * Supplier history reads RFQ and quotation records, so it is authorized as RFQ
 * and Quotation. It used to ask for `read SupplierProfile`, which was the only
 * subject available when it was written.
 *
 * Two dimensions, and only one of them moved:
 *
 *   - may this actor read RFQ / quotation data?   <- the ability check
 *   - may they see THIS supplier's history?       <- assertVisible + the query
 *
 * The second has never lived in the ability check, and these tests hold it in
 * place: an actor with every RFQ and quotation permission still cannot reach a
 * supplier outside their organization.
 */

const uid = () => Math.random().toString(36).slice(2, 8)

/**
 * A context whose answer depends on the subject asked about.
 *
 * `assertAbility` consults `ability.can(action, subject)` and nothing else, so a
 * double that decides per subject is what reveals which question the service
 * actually asks - a real ability cannot, because every role holds `read all`
 * and so answers the same for all three subjects.
 */
function ctxReading(...readable: Subject[]): MatchingCtx {
  const ability = {
    can: (_action: Action, subject: Subject) => readable.includes(subject),
  } as unknown as AppAbility
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
  return { user, organizationId: 'org1', ability, requestId: 'r1' }
}

function service(over: { assertVisible?: () => Promise<void> } = {}) {
  const assertVisible = vi.fn(over.assertVisible ?? (async () => undefined))
  // Typed with the params they actually receive, so the scoping assertion
  // below can read them back.
  type HistoryParams = { organizationId: string; supplierId: string }
  const rfqs = vi.fn(async (_p: HistoryParams) => ({
    items: [{ id: `h-${uid()}` }],
    nextCursor: null,
  }))
  const quotations = vi.fn(async (_p: HistoryParams) => ({
    items: [{ id: `q-${uid()}` }],
    nextCursor: null,
  }))

  const svc = createSupplierMatchingService({
    search: (async () => ({ items: [], nextCursor: null })) as never,
    scores: {} as never,
    history: { assertVisible, rfqs, quotations } as never,
  })
  return { svc, assertVisible, rfqs, quotations }
}

const query = { limit: 25 } as never

describe('supplier history is authorized as RFQ and Quotation', () => {
  it('lets an actor who may read RFQs fetch the RFQ history', async () => {
    const { svc, rfqs } = service()
    await expect(svc.rfqs(ctxReading('RFQ'), 'sup1', query)).resolves.toBeDefined()
    expect(rfqs).toHaveBeenCalled()
  })

  it('lets an actor who may read quotations fetch the quotation history', async () => {
    const { svc, quotations } = service()
    await expect(svc.quotations(ctxReading('Quotation'), 'sup1', query)).resolves.toBeDefined()
    expect(quotations).toHaveBeenCalled()
  })

  it('refuses RFQ history to an actor who may read only supplier records', async () => {
    // The regression this guards: SupplierProfile alone used to be enough.
    const { svc, rfqs } = service()
    await expect(svc.rfqs(ctxReading('SupplierProfile'), 'sup1', query)).rejects.toThrow(
      /not permitted/i,
    )
    expect(rfqs).not.toHaveBeenCalled()
  })

  it('refuses quotation history to an actor who may read only supplier records', async () => {
    const { svc, quotations } = service()
    await expect(svc.quotations(ctxReading('SupplierProfile'), 'sup1', query)).rejects.toThrow(
      /not permitted/i,
    )
    expect(quotations).not.toHaveBeenCalled()
  })

  it('does not let RFQ permission carry the quotation history with it', async () => {
    const { svc, quotations } = service()
    await expect(svc.quotations(ctxReading('RFQ'), 'sup1', query)).rejects.toThrow(/not permitted/i)
    expect(quotations).not.toHaveBeenCalled()
  })

  it('does not let Quotation permission carry the RFQ history with it', async () => {
    const { svc, rfqs } = service()
    await expect(svc.rfqs(ctxReading('Quotation'), 'sup1', query)).rejects.toThrow(/not permitted/i)
    expect(rfqs).not.toHaveBeenCalled()
  })
})

describe('the supplier constraint survives the subject change', () => {
  const invisible = async () => {
    throw new NotFoundError('Supplier not found.')
  }

  it('refuses RFQ history for a supplier the caller cannot see', async () => {
    // Full RFQ rights are not a way past the supplier boundary. A supplier in
    // another tenant is absent, not forbidden - the caller learns nothing.
    const { svc, rfqs } = service({ assertVisible: invisible })
    await expect(
      svc.rfqs(ctxReading('RFQ', 'Quotation'), 'other-org-supplier', query),
    ).rejects.toThrow(/Supplier not found/)
    expect(rfqs).not.toHaveBeenCalled()
  })

  it('refuses quotation history for a supplier the caller cannot see', async () => {
    const { svc, quotations } = service({ assertVisible: invisible })
    await expect(
      svc.quotations(ctxReading('RFQ', 'Quotation'), 'other-org-supplier', query),
    ).rejects.toThrow(/Supplier not found/)
    expect(quotations).not.toHaveBeenCalled()
  })

  it('checks visibility before reading, on both endpoints', async () => {
    const { svc, assertVisible } = service()
    await svc.rfqs(ctxReading('RFQ'), 'sup1', query)
    await svc.quotations(ctxReading('Quotation'), 'sup1', query)
    expect(assertVisible).toHaveBeenCalledTimes(2)
    expect(assertVisible).toHaveBeenCalledWith('org1', 'sup1')
  })

  it('scopes every query to the caller’s organization and the named supplier', async () => {
    const { svc, rfqs, quotations } = service()
    await svc.rfqs(ctxReading('RFQ'), 'sup1', query)
    await svc.quotations(ctxReading('Quotation'), 'sup1', query)

    for (const spy of [rfqs, quotations]) {
      const params = spy.mock.calls[0]?.[0]
      expect(params?.organizationId).toBe('org1')
      expect(params?.supplierId).toBe('sup1')
    }
  })
})

describe('every real role keeps the access it had', () => {
  // `read all` covers RFQ and Quotation as it covered SupplierProfile, so no
  // configured role gains or loses this endpoint.
  it.each(['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY'] as Role[])(
    '%s can still read both histories',
    async (role) => {
      const ability = buildAbilityFor([role])
      expect(ability.can('read', 'RFQ')).toBe(true)
      expect(ability.can('read', 'Quotation')).toBe(true)
      expect(ability.can('read', 'SupplierProfile')).toBe(true)
    },
  )
})
