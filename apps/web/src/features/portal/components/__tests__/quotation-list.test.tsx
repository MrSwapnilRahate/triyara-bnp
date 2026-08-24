import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import type { BuyerQuotationList, BuyerQuotationView } from '@triyara/core'
import { describe, expect, it } from 'vitest'

import { QuotationList } from '@/features/portal/components/quotation-list'
import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * The offers TRIYARA has sent this buyer, as they reach the screen.
 *
 * A quotation is the one place where both halves of the transaction touch: it is
 * priced from what a supplier quoted us, and shown to the buyer as our own
 * offer. So the assertions that matter most are the absences - no supplier, no
 * sourced cost, no margin, no line-level breakdown - because those are what turn
 * an offer into a route around the intermediary.
 */

const ITEM: BuyerQuotationView = {
  quotationNumber: 'QT-0001',
  revisionNumber: 2,
  status: 'UNDER_NEGOTIATION',
  currency: 'USD',
  grandTotal: '12500.0000',
  sentAt: new Date('2026-08-10'),
  validUntil: new Date('2026-10-10'),
}

function renderList(over: Partial<BuyerQuotationList> = {}) {
  const list: BuyerQuotationList = { items: [ITEM], hasMore: false, ...over }
  return renderWithProviders(<QuotationList list={list} />, { roles: ['EXTERNAL_PARTY'] })
}

describe('the quotation list shows the buyer what we offered them', () => {
  it('leads with the amount, formatted as money in the quoted currency', () => {
    renderList()
    const total = screen.getByRole('heading', { name: /12,500\.00/ })
    expect(total).toBeInTheDocument()
    // The currency is shown with the amount rather than as a bare code, so
    // there is no reading of the figure that silently assumes the wrong one.
    expect(total.textContent).toMatch(/US\$/)
  })

  it('quotes in the currency the offer carries, not a house default', () => {
    renderList({ items: [{ ...ITEM, currency: 'EUR', grandTotal: '9400.0000' }] })
    expect(screen.getByRole('heading', { name: /€9,400\.00/ })).toBeInTheDocument()
  })

  it('identifies the offer by number and revision', () => {
    renderList()
    expect(screen.getByText(/QT-0001/)).toBeInTheDocument()
    expect(screen.getByText(/revision 2/)).toBeInTheDocument()
  })

  it('shows status in words rather than enum casing', () => {
    renderList()
    expect(screen.getByText('Under negotiation')).toBeInTheDocument()
  })

  it('shows when it was sent and how long it stands', () => {
    renderList()
    expect(screen.getByText('10 Aug 2026')).toBeInTheDocument()
    expect(screen.getByText('10 Oct 2026')).toBeInTheDocument()
  })

  it('omits an expiry row when the offer carries no expiry', () => {
    renderList({ items: [{ ...ITEM, validUntil: null }] })
    expect(screen.queryByText('Valid until')).not.toBeInTheDocument()
  })

  it('omits a sent date when the offer has none recorded', () => {
    renderList({ items: [{ ...ITEM, sentAt: null }] })
    expect(screen.queryByText('Sent')).not.toBeInTheDocument()
  })

  it('says pricing is in progress rather than showing an empty total', () => {
    renderList({ items: [{ ...ITEM, grandTotal: null }] })
    expect(screen.getByRole('heading', { name: 'Pricing in progress' })).toBeInTheDocument()
  })

  it('falls back to the raw amount when it is not a finite number', () => {
    // Decimal arrives as a string. If it ever is not parseable, showing it
    // verbatim beats rendering `NaN` or a currency symbol against nothing.
    renderList({ items: [{ ...ITEM, grandTotal: 'not-a-number' }] })
    expect(screen.getByRole('heading', { name: 'not-a-number USD' })).toBeInTheDocument()
  })

  it('keeps revisions of one number apart', () => {
    // Quotation number alone is not unique across revisions; two revisions of
    // the same offer must both render rather than collapse on a duplicate key.
    renderList({
      items: [ITEM, { ...ITEM, revisionNumber: 3, grandTotal: '11900.0000' }],
    })
    expect(screen.getAllByText(/QT-0001/)).toHaveLength(2)
  })

  it('offers an honest empty state rather than a blank page', () => {
    renderList({ items: [] })
    expect(screen.getByText('No quotations yet')).toBeInTheDocument()
  })

  it('says so when more quotations exist than are shown', () => {
    renderList({ hasMore: true })
    expect(screen.getByText(/most recent quotations/)).toBeInTheDocument()
  })

  it('stays silent about truncation when there is none', () => {
    renderList()
    expect(screen.queryByText(/most recent quotations/)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderList()
    await expectNoAxeViolations(container)
  })

  it('has no accessibility violations when empty', async () => {
    const { container } = renderList({ items: [] })
    await expectNoAxeViolations(container)
  })
})

describe('the list is read-only, because accepting an offer is a conversation', () => {
  it('renders no control that would act on a quotation', () => {
    renderList()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('each quotation links to its own detail', () => {
  it('links by quotationNumber, which the DTO already carries', () => {
    // Not by row id: Batch G deliberately keeps the database id out of every
    // buyer-facing projection, and linking must not reopen that.
    renderList()
    expect(screen.getByRole('link', { name: 'QT-0001' })).toHaveAttribute(
      'href',
      '/portal/quotations/QT-0001',
    )
  })

  it('encodes a number that needs escaping', () => {
    renderList({ items: [{ ...ITEM, quotationNumber: 'QT/2026 001' }] })
    expect(screen.getByRole('link', { name: 'QT/2026 001' })).toHaveAttribute(
      'href',
      '/portal/quotations/QT%2F2026%20001',
    )
  })

  it('links one revision per row without widening the DTO', () => {
    // Two revisions of one number both link to the same place: the detail
    // resolves whichever revision is currently standing, so no revision number
    // and no id needs to enter the URL.
    renderList({ items: [ITEM, { ...ITEM, revisionNumber: 3 }] })
    for (const link of screen.getAllByRole('link', { name: 'QT-0001' })) {
      expect(link).toHaveAttribute('href', '/portal/quotations/QT-0001')
    }
  })

  it('still carries no database id on any row', () => {
    renderList()
    expect(Object.keys(ITEM)).not.toContain('id')
  })
})

describe('nothing from the sourcing side of the intermediary is rendered', () => {
  it('renders no supplier, cost or internal value even when one is smuggled in', () => {
    // The money sentinels share no digits with the legitimate grand total,
    // `12500.0000`, which renders as US$12,500.00 - a rounder decoy would be a
    // substring of the number we are supposed to show.
    const polluted = {
      ...ITEM,
      id: 'qt-internal-id',
      organizationId: 'org-internal-1',
      buyerId: 'acct-internal-1',
      primaryRfqId: 'rfq-internal-id',
      supplierId: 'sup-99',
      supplierName: 'Acme Rice Mills',
      createdById: 'staff-1',
      subtotal: '9111.1111',
      taxTotal: '777.7777',
      items: [
        {
          sourceOptions: [
            { supplierId: 'sup-99', companyName: 'Acme Rice Mills', landedUnitCost: '6.6666' },
          ],
        },
      ],
    } as unknown as BuyerQuotationView

    const { container } = renderWithProviders(
      <QuotationList list={{ items: [polluted], hasMore: false }} />,
      { roles: ['EXTERNAL_PARTY'] },
    )

    const rendered = container.innerHTML
    for (const leak of [
      'qt-internal-id',
      'org-internal-1',
      'acct-internal-1',
      'rfq-internal-id',
      'sup-99',
      'Acme Rice Mills',
      'staff-1',
      '9111.1111',
      '777.7777',
      '6.6666',
    ]) {
      expect(rendered, `must not render ${leak}`).not.toContain(leak)
    }
  })
})

/**
 * How the page is allowed to reach a buyer's quotations.
 *
 * Source-level, for the reason Batch D established: a page that queried the
 * repository itself would type-check and render identically, while skipping
 * everything `resolve` does between the session and the data - the APPROVED
 * gate, the supplier and dual refusals, and the organization scope. None of
 * that is visible in rendered output.
 */
describe('the quotations page reaches data only through the sanctioned path', () => {
  const source = readFileSync(
    join(__dirname, '../../../../app/(portal)/portal/quotations/page.tsx'),
    'utf8',
  )
  // Comments stripped, so the check can neither pass nor fail on prose.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('establishes a session before anything else', () => {
    expect(code).toContain('requireAuth()')
  })

  it('resolves the party before reading anything', () => {
    expect(code).toContain('portalContextService.resolve')
  })

  it('reads through the buyer portal service', () => {
    expect(code).toContain('buyerPortalService.listQuotations')
  })

  it('imports no repository or database package', () => {
    expect(code).not.toContain('@triyara/db')
    expect(code).not.toContain('quotationRepository')
  })

  it('does not reach the internal CASL-gated quotation service', () => {
    // The internal service opens with assertAbility('read','Quotation'), which
    // every portal user fails, and returns the sourcing columns besides.
    expect(code).not.toContain('quotationService')
  })

  it('takes no props, so no URL input can choose the account', () => {
    expect(code).toContain('export default async function Page()')
    expect(code).not.toContain('searchParams')
    expect(code).not.toContain('params')
  })

  it('is resolved per request rather than cached across sessions', () => {
    // A blocked, deleted or re-tenanted account must stop working on the next
    // request, not at session expiry.
    expect(code).toContain("dynamic = 'force-dynamic'")
  })
})
