// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildBreadcrumb, humanise, looksLikeId } from '../breadcrumb'

describe('looksLikeId', () => {
  it('recognises cuid and uuid segments', () => {
    expect(looksLikeId('cms77j9gp009bwdlna9x0wwep')).toBe(true)
    expect(looksLikeId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(true)
  })

  it('does not mistake a business identifier for an id', () => {
    expect(looksLikeId('RFQ-2026-000001')).toBe(false)
    expect(looksLikeId('products')).toBe(false)
  })
})

describe('buildBreadcrumb', () => {
  it('builds a linked trail with the last crumb unlinked', () => {
    const crumbs = buildBreadcrumb('/catalog/products')
    expect(crumbs.map((c) => c.label)).toEqual(['Catalog', 'Products'])
    expect(crumbs[0]!.href).toBe('/catalog')
    expect(crumbs.at(-1)!.href).toBeUndefined()
  })

  it('shows a placeholder for an id rather than the id itself', () => {
    const crumbs = buildBreadcrumb('/rfqs/cms77j9gp009bwdlna9x0wwep/responses')
    expect(crumbs[1]!.loading).toBe(true)
    expect(crumbs[1]!.label).toBe('')
    expect(crumbs[2]!.label).toBe('Responses')
  })

  it('humanises an unmapped segment instead of dropping it', () => {
    expect(humanise('payment-terms')).toBe('Payment terms')
  })

  it('returns nothing at the root', () => {
    expect(buildBreadcrumb('/')).toEqual([])
  })
})
