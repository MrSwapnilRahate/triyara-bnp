import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import type { BuyerQuotationDetailView, BuyerQuotationLineView } from '@triyara/core'
import { describe, expect, it } from 'vitest'

import { QuotationDetail } from '@/features/portal/components/quotation-detail'
import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * One offer as it reaches the buyer's screen.
 *
 * A quotation is where both halves of the transaction touch: it is priced from
 * what a supplier quoted us and shown to the buyer as our own offer. So the
 * assertions that matter most are the absences - no supplier, no sourced cost,
 * no landed cost, no margin - because those are what turn an offer into a route
 * around the intermediary.
 */

const LINE: BuyerQuotationLineView = {
  lineNumber: 1,
  productName: 'Sona Masoori, unpolished',
  quantity: '25',
  unit: 'MT',
  unitPrice: '440.0000',
  lineSubtotal: '11000.0000',
  packaging: '25kg PP bags',
  hsCode: '10063020',
  countryOfOrigin: 'IN',
  requiredCertifications: ['ORGANIC'],
  leadTimeDays: 45,
}

const QUOTATION: BuyerQuotationDetailView = {
  quotationNumber: 'QT-0001',
  revisionNumber: 2,
  type: 'FIRM',
  status: 'UNDER_NEGOTIATION',
  title: 'Basmati rice, 25t FOB Nhava Sheva',
  currency: 'USD',
  subtotal: '11000.0000',
  chargesTotal: '1200.0000',
  discountTotal: '200.0000',
  taxTotal: '500.0000',
  grandTotal: '12500.0000',
  incoterm: 'FOB',
  namedPlace: 'Nhava Sheva',
  destinationCountry: 'GB',
  destinationPort: 'Felixstowe',
  paymentTermsText: '30% advance, balance against BL copy',
  leadTimeDays: 45,
  packingSummary: '25kg PP bags, 40 per pallet',
  samplingTerms: 'Pre-shipment sample on request',
  sentAt: new Date('2026-08-10'),
  validFrom: new Date('2026-08-10'),
  validUntil: new Date('2026-10-10'),
  acceptedAt: null,
  rejectedAt: null,
  lines: [LINE],
  charges: [
    {
      type: 'FREIGHT',
      label: 'Ocean freight',
      amount: '1200.0000',
      currency: 'USD',
      isDeduction: false,
    },
    { type: 'DISCOUNT', label: null, amount: '200.0000', currency: 'USD', isDeduction: true },
  ],
}

function renderDetail(over: Partial<BuyerQuotationDetailView> = {}) {
  return renderWithProviders(<QuotationDetail quotation={{ ...QUOTATION, ...over }} />, {
    roles: ['EXTERNAL_PARTY'],
  })
}

describe('the quotation detail shows the buyer the offer we made them', () => {
  it('leads with the offer title', () => {
    renderDetail()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Basmati rice, 25t FOB Nhava Sheva' }),
    ).toBeInTheDocument()
  })

  it('falls back to the number when the offer has no title', () => {
    renderDetail({ title: null })
    expect(screen.getByRole('heading', { level: 1, name: 'Quotation QT-0001' })).toBeInTheDocument()
  })

  it('identifies the offer by number and revision', () => {
    renderDetail()
    expect(screen.getByText(/QT-0001/)).toBeInTheDocument()
    expect(screen.getByText(/revision 2/)).toBeInTheDocument()
  })

  it('shows status and offer type in words rather than enum casing', () => {
    renderDetail()
    expect(screen.getByText('Under negotiation')).toBeInTheDocument()
    expect(screen.getByText('Firm offer')).toBeInTheDocument()
  })

  it('links back to the list', () => {
    renderDetail()
    expect(screen.getByRole('link', { name: /All quotations/ })).toHaveAttribute(
      'href',
      '/portal/quotations',
    )
  })
})

describe('the quoted lines', () => {
  it('names each line and its own subtotal', () => {
    renderDetail()
    expect(screen.getByText('Sona Masoori, unpolished')).toBeInTheDocument()
    // Twice on purpose: once on the line, once as the Subtotal of the price
    // breakdown, because one line means the two figures are the same number.
    expect(screen.getAllByText('US$11,000.00')).toHaveLength(2)
  })

  it('shows quantity, unit and unit price', () => {
    renderDetail()
    expect(screen.getByText('25 MT')).toBeInTheDocument()
    expect(screen.getByText('US$440.00')).toBeInTheDocument()
  })

  it('shows the trade detail a buyer needs to clear goods', () => {
    renderDetail()
    expect(screen.getByText('10063020')).toBeInTheDocument()
    expect(screen.getByText('IN')).toBeInTheDocument()
    expect(screen.getByText('Organic')).toBeInTheDocument()
  })

  it('omits line fields that carry no value', () => {
    renderDetail({
      lines: [
        {
          ...LINE,
          packaging: null,
          hsCode: null,
          countryOfOrigin: null,
          leadTimeDays: null,
          requiredCertifications: [],
        },
      ],
    })
    expect(screen.queryByText('HS code')).not.toBeInTheDocument()
    expect(screen.queryByText('Origin')).not.toBeInTheDocument()
    expect(screen.queryByText('Certifications')).not.toBeInTheDocument()
  })

  it('names an unnamed line rather than rendering nothing', () => {
    renderDetail({ lines: [{ ...LINE, productName: null }] })
    expect(screen.getByText('Unnamed line')).toBeInTheDocument()
  })

  it('offers an honest empty state when the offer has no lines', () => {
    renderDetail({ lines: [] })
    expect(screen.getByText('No lines recorded')).toBeInTheDocument()
  })

  it('renders every line when there are several', () => {
    renderDetail({
      lines: [LINE, { ...LINE, lineNumber: 2, productName: 'Parboiled rice' }],
    })
    expect(screen.getByText('Sona Masoori, unpolished')).toBeInTheDocument()
    expect(screen.getByText('Parboiled rice')).toBeInTheDocument()
  })
})

describe('the price breaks down so the total can be checked', () => {
  it('shows the subtotal and the grand total', () => {
    renderDetail()
    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('US$12,500.00')).toBeInTheDocument()
  })

  it('itemises the charges we chose to show', () => {
    renderDetail()
    expect(screen.getByText('Ocean freight')).toBeInTheDocument()
  })

  it('labels a charge by type when it carries no label of its own', () => {
    renderDetail()
    expect(screen.getByText('Discount')).toBeInTheDocument()
  })

  it('renders a deduction as a negative amount', () => {
    renderDetail()
    expect(screen.getByText(/−US\$200\.00/)).toBeInTheDocument()
  })

  it('falls back to the charge totals when nothing was itemised', () => {
    // Without an itemised list the buyer would otherwise see a gap between the
    // subtotal and the total with nothing to explain it.
    renderDetail({ charges: [] })
    expect(screen.getByText('Charges')).toBeInTheDocument()
    expect(screen.getByText('Discount')).toBeInTheDocument()
  })

  it('does not repeat the roll-ups when charges are already itemised', () => {
    renderDetail()
    expect(screen.queryByText('Charges')).not.toBeInTheDocument()
  })

  it('omits a component that is null or zero', () => {
    renderDetail({ charges: [], chargesTotal: null, discountTotal: '0', taxTotal: null })
    expect(screen.queryByText('Charges')).not.toBeInTheDocument()
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
    expect(screen.queryByText('Tax')).not.toBeInTheDocument()
  })

  it('says pricing is in progress rather than showing an empty total', () => {
    renderDetail({ grandTotal: null })
    expect(screen.getByText('Pricing in progress')).toBeInTheDocument()
  })
})

describe('terms and shipment', () => {
  it('shows the incoterm with its named place', () => {
    renderDetail()
    expect(screen.getByText('FOB Nhava Sheva')).toBeInTheDocument()
  })

  it('shows the destination', () => {
    renderDetail()
    expect(screen.getByText('Felixstowe, GB')).toBeInTheDocument()
  })

  it('shows the payment terms as agreed', () => {
    renderDetail()
    expect(screen.getByText('30% advance, balance against BL copy')).toBeInTheDocument()
  })

  it('shows validity dates', () => {
    renderDetail()
    // Sent and Valid from are the same day on this fixture.
    expect(screen.getAllByText('10 Aug 2026')).toHaveLength(2)
    expect(screen.getByText('10 Oct 2026')).toBeInTheDocument()
  })

  it('shows a decision date once the offer has one', () => {
    renderDetail({ status: 'ACCEPTED', acceptedAt: new Date('2026-08-20') })
    expect(screen.getByText('Accepted on')).toBeInTheDocument()
    expect(screen.getByText('20 Aug 2026')).toBeInTheDocument()
  })

  it('omits every term block that carries no value', () => {
    renderDetail({
      incoterm: null,
      namedPlace: null,
      destinationCountry: null,
      destinationPort: null,
      paymentTermsText: null,
      packingSummary: null,
      samplingTerms: null,
      leadTimeDays: null,
      validFrom: null,
      validUntil: null,
      sentAt: null,
    })
    for (const label of [
      'Incoterm',
      'Destination',
      'Payment terms',
      'Packing',
      'Sampling',
      'Valid from',
      'Valid until',
      'Sent',
      'Accepted on',
      'Declined on',
    ]) {
      expect(screen.queryByText(label), label).not.toBeInTheDocument()
    }
  })
})

describe('the detail is read-only, because accepting an offer is a conversation', () => {
  it('renders no control that would act on the quotation', () => {
    renderDetail()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    // The only link is the way back to the list.
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})

describe('accessibility', () => {
  it('has no violations', async () => {
    const { container } = renderDetail()
    await expectNoAxeViolations(container)
  })

  it('has no violations with no lines and no charges', async () => {
    const { container } = renderDetail({ lines: [], charges: [] })
    await expectNoAxeViolations(container)
  })
})

describe('nothing from the sourcing side of the intermediary is rendered', () => {
  it('renders no supplier, cost or internal value even when one is smuggled in', () => {
    // The sentinels share no digits with any legitimate figure on this fixture
    // - 11000.00, 1200.00, 200.00, 500.00, 12500.00, 440.00 - because a rounder
    // decoy would sit inside a number we are supposed to show.
    const polluted = {
      ...QUOTATION,
      id: 'qt-internal-id',
      organizationId: 'org-internal-1',
      buyerId: 'acct-internal-1',
      primaryRfqId: 'rfq-internal-id',
      createdById: 'staff-1',
      costTotal: '9111.1111',
      marginPercent: '27.7777',
      rejectionReason: 'internal rejection note',
      lines: [
        {
          ...LINE,
          id: 'qti-internal-id',
          rfqItemId: 'rfqi-internal-id',
          unitCost: '333.3333',
          marginPercent: '18.8888',
          lineTotal: '66666.6666',
          remarks: 'operator remark that must not be rendered',
          sourceOptions: [
            { supplierId: 'sup-99', companyName: 'Acme Rice Mills', landedUnitCost: '6.6666' },
          ],
        },
      ],
    } as unknown as BuyerQuotationDetailView

    const { container } = renderWithProviders(<QuotationDetail quotation={polluted} />, {
      roles: ['EXTERNAL_PARTY'],
    })

    const rendered = container.innerHTML
    for (const leak of [
      'qt-internal-id',
      'org-internal-1',
      'acct-internal-1',
      'rfq-internal-id',
      'qti-internal-id',
      'rfqi-internal-id',
      'staff-1',
      '9111.1111',
      '27.7777',
      '333.3333',
      '18.8888',
      '66666.6666',
      'internal rejection note',
      'operator remark',
      'sup-99',
      'Acme Rice Mills',
      '6.6666',
    ]) {
      expect(rendered, `must not render ${leak}`).not.toContain(leak)
    }
  })
})

/**
 * How the page is allowed to reach one of a buyer's quotations.
 *
 * Source-level, for the reason Batch D established: a page that queried the
 * repository itself would type-check and render identically, while skipping
 * everything `resolve` does between the session and the data - the APPROVED
 * gate, the supplier and dual refusals, and the organization scope. None of
 * that is visible in rendered output.
 */
describe('the quotation detail page reaches data only through the sanctioned path', () => {
  const source = readFileSync(
    join(__dirname, '../../../../app/(portal)/portal/quotations/[quotationNumber]/page.tsx'),
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
    expect(code).toContain('buyerPortalService.getQuotation')
  })

  it('imports no repository or database package', () => {
    expect(code).not.toContain('@triyara/db')
    expect(code).not.toContain('quotationRepository')
    expect(code).not.toContain('prisma')
  })

  it('does not reach the internal CASL-gated quotation service', () => {
    // The internal service opens with assertAbility('read','Quotation'), which
    // every portal user fails, and returns the sourcing columns besides.
    expect(code).not.toContain('quotationService')
  })

  it('takes only the route number, so no URL input can choose the account', () => {
    expect(code).toContain('params: Promise<{ quotationNumber: string }>')
    expect(code).not.toContain('searchParams')
    expect(code).not.toContain('accountId')
    expect(code).not.toContain('organizationId')
    expect(code).not.toContain('buyerId')
  })

  it('is resolved per request rather than cached across sessions', () => {
    expect(code).toContain("dynamic = 'force-dynamic'")
  })
})
