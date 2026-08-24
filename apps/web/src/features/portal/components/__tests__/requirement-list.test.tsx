import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import type { BuyerRequirementList, BuyerRequirementView } from '@triyara/core'
import { describe, expect, it } from 'vitest'

import { RequirementList } from '@/features/portal/components/requirement-list'
import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * The buyer's requirements as they reach the screen.
 *
 * The assertions that matter are the absences: a requirement is the buyer's own
 * record, but the other side of it - which suppliers were invited, which one
 * won, who at TRIYARA touched it - must not appear, because that is the wall the
 * intermediary model depends on.
 */

const ITEM: BuyerRequirementView = {
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
}

function renderList(over: Partial<BuyerRequirementList> = {}) {
  const list: BuyerRequirementList = { items: [ITEM], hasMore: false, ...over }
  return renderWithProviders(<RequirementList list={list} />, { roles: ['EXTERNAL_PARTY'] })
}

describe('the requirement list shows the buyer their own records', () => {
  it('names each requirement and its reference', () => {
    renderList()
    expect(screen.getByText('Basmati rice, 25t')).toBeInTheDocument()
    expect(screen.getByText(/RFQ-0001/)).toBeInTheDocument()
  })

  it('shows status and priority in words rather than enum casing', () => {
    renderList()
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.getByText('Normal')).toBeInTheDocument()
  })

  it('shows the destination when there is one', () => {
    renderList()
    expect(screen.getByText('Felixstowe, GB')).toBeInTheDocument()
  })

  it('omits optional blocks that carry no value', () => {
    renderList({
      items: [
        {
          ...ITEM,
          destinationCountry: null,
          destinationPort: null,
          incoterm: null,
          currency: null,
          quotationDeadline: null,
          expectedShipmentDate: null,
        },
      ],
    })

    expect(screen.queryByText('Destination')).not.toBeInTheDocument()
    expect(screen.queryByText('Incoterm')).not.toBeInTheDocument()
    expect(screen.queryByText('Currency')).not.toBeInTheDocument()
    expect(screen.queryByText('Quotes needed by')).not.toBeInTheDocument()
  })

  it('offers an honest empty state rather than a blank page', () => {
    renderList({ items: [] })
    expect(screen.getByText('No requirements yet')).toBeInTheDocument()
  })

  it('says so when more requirements exist than are shown', () => {
    renderList({ hasMore: true })
    expect(screen.getByText(/most recent requirements/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderList()
    await expectNoAxeViolations(container)
  })
})

describe('nothing from the other side of the intermediary is rendered', () => {
  it('renders no supplier, staff or internal value even when one is smuggled in', () => {
    const polluted = {
      ...ITEM,
      awardedSupplierId: 'sup-99',
      awardedById: 'staff-1',
      suppliers: [{ supplier: { companyName: 'Acme Rice Mills' } }],
      description: 'internal notes',
      organizationId: 'org1',
      buyerId: 'acct-1',
      id: 'rfq-internal-id',
    } as unknown as BuyerRequirementView

    const { container } = renderWithProviders(
      <RequirementList list={{ items: [polluted], hasMore: false }} />,
      { roles: ['EXTERNAL_PARTY'] },
    )

    const rendered = container.innerHTML
    for (const leak of [
      'sup-99',
      'staff-1',
      'Acme Rice Mills',
      'internal notes',
      'org1',
      'acct-1',
      'rfq-internal-id',
    ]) {
      expect(rendered, `must not render ${leak}`).not.toContain(leak)
    }
  })
})

/**
 * How the page is allowed to reach a buyer's requirements.
 *
 * Source-level, for the reason Batch D established: a page that queried the
 * repository itself would type-check and render identically, while skipping
 * everything `resolve` does between the session and the data - the APPROVED
 * gate, the supplier and dual refusals, and the organization scope. None of that
 * is visible in rendered output.
 */
describe('the requirements page reaches data only through the sanctioned path', () => {
  const source = readFileSync(
    join(__dirname, '../../../../app/(portal)/portal/requirements/page.tsx'),
    'utf8',
  )
  // Comments stripped, so the check can neither pass nor fail on prose.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('resolves the party before reading anything', () => {
    expect(code).toContain('portalContextService.resolve')
  })

  it('reads through the buyer portal service', () => {
    expect(code).toContain('buyerPortalService.listRequirements')
  })

  it('imports no repository or database package', () => {
    expect(code).not.toContain('@triyara/db')
    expect(code).not.toContain('rfqRepository')
  })

  it('does not reach the internal CASL-gated RFQ service', () => {
    // `rfqService.list` opens with assertAbility('read','RFQ'), which every
    // portal user fails. Routing through it would be a permission problem
    // dressed as a data problem.
    expect(code).not.toContain('rfqService')
  })

  it('takes no props, so no URL input can choose the account', () => {
    expect(code).toContain('export default async function Page()')
    expect(code).not.toContain('searchParams')
    expect(code).not.toContain('params')
  })
})
