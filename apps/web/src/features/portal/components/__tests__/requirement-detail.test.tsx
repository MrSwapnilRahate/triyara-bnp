import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import type { BuyerRequirementDetail } from '@triyara/core'
import { describe, expect, it } from 'vitest'

import { RequirementDetail } from '@/features/portal/components/requirement-detail'
import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * One requirement as it reaches the buyer's screen.
 *
 * The assertions that matter are the absences. A requirement is the buyer's own
 * record, but the other half of the transaction - which suppliers were invited,
 * what they bid, who at TRIYARA touched it - must not appear, because that is
 * the wall the intermediary model depends on.
 */

const DETAIL: BuyerRequirementDetail = {
  rfqNumber: 'RFQ-0001',
  title: 'Basmati rice, 25t',
  status: 'PUBLISHED',
  priority: 'NORMAL',
  currency: 'USD',
  incoterm: 'FOB',
  destinationCountry: 'GB',
  destinationPort: 'Felixstowe',
  expectedShipmentDate: new Date('2026-10-01'),
  quotationDeadline: new Date('2026-09-01'),
  createdAt: new Date('2026-08-01'),
  items: [
    {
      lineNumber: 1,
      productName: 'Basmati rice',
      quantity: '25',
      unit: 'MT',
      requiredCertifications: ['ORGANIC'],
      packaging: '25kg bags',
    },
  ],
}

function renderDetail(over: Partial<BuyerRequirementDetail> = {}) {
  return renderWithProviders(<RequirementDetail requirement={{ ...DETAIL, ...over }} />, {
    roles: ['EXTERNAL_PARTY'],
  })
}

describe('the requirement detail shows the buyer their own record', () => {
  it('names the requirement and its reference', () => {
    renderDetail()
    expect(screen.getByText('Basmati rice, 25t')).toBeInTheDocument()
    expect(screen.getByText('RFQ-0001')).toBeInTheDocument()
  })

  it('shows status and priority in words rather than enum casing', () => {
    renderDetail()
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.getByText(/Normal priority/)).toBeInTheDocument()
  })

  it('shows the commercial and shipment fields it was given', () => {
    renderDetail()
    expect(screen.getByText('Felixstowe, GB')).toBeInTheDocument()
    expect(screen.getByText('FOB')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
  })

  it('omits optional fields that carry no value', () => {
    renderDetail({
      destinationCountry: null,
      destinationPort: null,
      incoterm: null,
      currency: null,
      quotationDeadline: null,
      expectedShipmentDate: null,
    })

    expect(screen.queryByText('Destination')).not.toBeInTheDocument()
    expect(screen.queryByText('Incoterm')).not.toBeInTheDocument()
    expect(screen.queryByText('Currency')).not.toBeInTheDocument()
  })

  it('lists the requirement lines', () => {
    renderDetail()
    expect(screen.getByText('Basmati rice')).toBeInTheDocument()
    expect(screen.getByText('25 MT')).toBeInTheDocument()
    expect(screen.getByText('25kg bags')).toBeInTheDocument()
    expect(screen.getByText('Organic')).toBeInTheDocument()
  })

  it('handles a line with no name and no optional detail', () => {
    renderDetail({
      items: [
        {
          lineNumber: 1,
          productName: null,
          quantity: '10',
          unit: 'MT',
          requiredCertifications: [],
          packaging: null,
        },
      ],
    })

    expect(screen.getByText('Unnamed line')).toBeInTheDocument()
    expect(screen.queryByText('Packaging')).not.toBeInTheDocument()
    expect(screen.queryByText('Certifications required')).not.toBeInTheDocument()
  })

  it('offers an honest empty state when no lines are recorded', () => {
    renderDetail({ items: [] })
    expect(screen.getByText('No lines recorded')).toBeInTheDocument()
  })

  it('links back to the requirement list', () => {
    renderDetail()
    expect(screen.getByRole('link', { name: /All requirements/ })).toHaveAttribute(
      'href',
      '/portal/requirements',
    )
  })

  it('offers no write action of any kind', () => {
    // Read-only by construction: cancelling or chasing a requirement is a
    // conversation with a TRIYARA contact, not a button.
    renderDetail()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderDetail()
    await expectNoAxeViolations(container)
  })
})

describe('nothing from the other side of the intermediary is rendered', () => {
  it('renders no supplier, staff or internal value even when one is smuggled in', () => {
    const polluted = {
      ...DETAIL,
      id: 'rfq-internal-id',
      organizationId: 'org1',
      buyerId: 'acct-1',
      awardedSupplierId: 'sup-99',
      createdById: 'staff-1',
      description: 'internal notes',
      suppliers: [{ supplier: { companyName: 'Acme Rice Mills' } }],
      items: [
        {
          ...DETAIL.items[0]!,
          id: 'item-internal-id',
          remarks: 'operator remark',
          responses: [{ price: '9.99' }],
        },
      ],
    } as unknown as BuyerRequirementDetail

    const { container } = renderWithProviders(<RequirementDetail requirement={polluted} />, {
      roles: ['EXTERNAL_PARTY'],
    })

    const rendered = container.innerHTML
    for (const leak of [
      'rfq-internal-id',
      'org1',
      'acct-1',
      'sup-99',
      'staff-1',
      'internal notes',
      'Acme Rice Mills',
      'item-internal-id',
      'operator remark',
      '9.99',
    ]) {
      expect(rendered, `must not render ${leak}`).not.toContain(leak)
    }
  })
})

/**
 * How the detail page is allowed to reach a buyer's requirement.
 *
 * Source-level, for the reason Batch D and E established: a page that queried
 * the repository itself would type-check and render identically while skipping
 * everything the resolver does between the session and the data. None of that is
 * visible in rendered output.
 */
describe('the detail page reaches data only through the sanctioned path', () => {
  const source = readFileSync(
    join(__dirname, '../../../../app/(portal)/portal/requirements/[rfqNumber]/page.tsx'),
    'utf8',
  )
  // Comments stripped, so the check can neither pass nor fail on prose.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('resolves the party before reading anything', () => {
    expect(code).toContain('portalContextService.resolve')
  })

  it('reads through the buyer portal service', () => {
    expect(code).toContain('buyerPortalService.getRequirement')
  })

  it('imports no repository or database package', () => {
    expect(code).not.toContain('@triyara/db')
    expect(code).not.toContain('rfqRepository')
  })

  it('does not reach the internal CASL-gated RFQ service', () => {
    expect(code).not.toContain('rfqService')
  })

  it('takes only rfqNumber from the route', () => {
    // The route parameter may name a requirement. It may never name an account,
    // an organization or a party type - those come from the resolved context.
    expect(code).toContain('params: Promise<{ rfqNumber: string }>')
    expect(code).not.toContain('accountId')
    expect(code).not.toContain('organizationId')
    expect(code).not.toContain('buyerId')
    expect(code).not.toContain('searchParams')
  })
})
