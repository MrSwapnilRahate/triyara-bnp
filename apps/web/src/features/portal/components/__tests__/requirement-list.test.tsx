import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import type {
  BuyerPendingRequirementList,
  BuyerRequirementList,
  BuyerRequirementView,
} from '@triyara/core'
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

/** No pending submissions unless a test says so - these assert the RFQ half. */
const NO_PENDING: BuyerPendingRequirementList = { items: [], hasMore: false }

function renderList(
  over: Partial<BuyerRequirementList> = {},
  pending: BuyerPendingRequirementList = NO_PENDING,
) {
  const list: BuyerRequirementList = { items: [ITEM], hasMore: false, ...over }
  return renderWithProviders(<RequirementList list={list} pending={pending} />, {
    roles: ['EXTERNAL_PARTY'],
  })
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
      <RequirementList list={{ items: [polluted], hasMore: false }} pending={NO_PENDING} />,
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

describe('each requirement links to its own detail', () => {
  it('links by rfqNumber, which the DTO already carries', () => {
    // Not by row id: Batch E deliberately keeps the database id out of every
    // buyer-facing projection, and linking must not reopen that.
    renderList()
    expect(screen.getByRole('link', { name: 'Basmati rice, 25t' })).toHaveAttribute(
      'href',
      '/portal/requirements/RFQ-0001',
    )
  })

  it('encodes a number that needs escaping', () => {
    renderList({ items: [{ ...ITEM, rfqNumber: 'RFQ/2026 001' }] })
    expect(screen.getByRole('link', { name: 'Basmati rice, 25t' })).toHaveAttribute(
      'href',
      '/portal/requirements/RFQ%2F2026%20001',
    )
  })
})

/**
 * Submitted enquiries, shown beside the RFQs.
 *
 * The two must not read as the same kind of row. An RFQ is work we have started;
 * an enquiry under review is something nobody has looked at yet, and showing it
 * with an RFQ's status and a link to a detail page would tell the buyer we are
 * further along than we are.
 */
const PENDING = {
  reference: 'QR-2026-000042',
  product: 'Turmeric fingers',
  quantity: '5 MT',
  submittedAt: new Date('2026-08-20'),
}

function renderWithPending(items = [PENDING], listItems = [ITEM]) {
  return renderWithProviders(
    <RequirementList
      list={{ items: listItems, hasMore: false }}
      pending={{ items, hasMore: false }}
    />,
    { roles: ['EXTERNAL_PARTY'] },
  )
}

describe('a submitted requirement appears while it is still being reviewed', () => {
  it('shows what they asked for', () => {
    renderWithPending()
    expect(screen.getByText('Turmeric fingers')).toBeInTheDocument()
    expect(screen.getByText('5 MT')).toBeInTheDocument()
  })

  it('shows the reference they can quote', () => {
    renderWithPending()
    expect(screen.getByText(/QR-2026-000042/)).toBeInTheDocument()
  })

  it('shows when they sent it', () => {
    renderWithPending()
    expect(screen.getByText(/20 Aug 2026/)).toBeInTheDocument()
  })

  it('says plainly that it is under review', () => {
    renderWithPending()
    expect(screen.getByText(/submitted — under review/i)).toBeInTheDocument()
  })

  it('is distinguishable from an RFQ rather than mixed in', () => {
    // The RFQ carries its own number and status; the enquiry carries neither.
    renderWithPending()
    expect(screen.getByText(/RFQ-0001/)).toBeInTheDocument()
    expect(screen.getByText(/QR-2026-000042/)).toBeInTheDocument()
  })

  it('does not link to a detail page that does not exist', () => {
    renderWithPending()
    const links = screen.queryAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links.some((h) => h?.includes('QR-2026-000042'))).toBe(false)
  })

  it('shows only the pending item when there is no RFQ yet', () => {
    renderWithPending([PENDING], [])
    expect(screen.getByText('Turmeric fingers')).toBeInTheDocument()
    expect(screen.queryByText(/No requirements yet/)).not.toBeInTheDocument()
  })

  it('still offers the empty state when there is genuinely nothing', () => {
    renderWithProviders(
      <RequirementList
        list={{ items: [], hasMore: false }}
        pending={{ items: [], hasMore: false }}
      />,
      { roles: ['EXTERNAL_PARTY'] },
    )
    expect(screen.getByText('No requirements yet')).toBeInTheDocument()
  })

  it('offers a way to submit a new one', () => {
    renderWithPending()
    const link = screen.getByRole('link', { name: /new requirement/i })
    expect(link).toHaveAttribute('href', '/portal/requirements/new')
  })

  it('has no accessibility violations with both kinds of row', async () => {
    const { container } = renderWithPending()
    await expectNoAxeViolations(container)
  })

  it('renders no internal field even when the object carries some', () => {
    const polluted = {
      ...PENDING,
      id: 'qr-internal-id',
      organizationId: 'org-internal',
      buyerAccountId: 'acct-internal',
      reviewedById: 'staff-1',
      reviewNotes: 'Probably a tyre-kicker',
      leadScore: 'Cold',
      contactEmail: 'priya@buyer.test',
    } as unknown as typeof PENDING

    const { container } = renderWithPending([polluted], [])
    const rendered = container.innerHTML

    for (const leak of [
      'qr-internal-id',
      'org-internal',
      'acct-internal',
      'staff-1',
      'tyre-kicker',
      'priya@buyer.test',
    ]) {
      expect(rendered, `must not render ${leak}`).not.toContain(leak)
    }
  })
})
