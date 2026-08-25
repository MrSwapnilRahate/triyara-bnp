import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import type { BuyerPortalSummary } from '@triyara/core'
import { describe, expect, it } from 'vitest'

import {
  PortalOverview,
  type PortalOverviewView,
} from '@/features/portal/components/portal-overview'
import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * What the portal actually puts on a buyer's screen.
 *
 * The interesting assertions here are the absences. `PortalPartyContext`
 * carries `accountId`, `organizationId` and `userId` because the server scopes
 * queries by them; none of the three may reach the DOM. A test that only
 * checked the company name renders would pass just as happily against a
 * component handed the whole context.
 */

const VIEW: PortalOverviewView = {
  companyName: 'Global Foods',
  country: 'GB',
  partyTypeLabel: 'Buyer',
  signedInAs: 'A Buyer',
}

/** Identifiers that exist server-side and must never be rendered. */
const FORBIDDEN_IDS = {
  accountId: 'acct-1',
  organizationId: 'org1',
  userId: 'u1',
}

/** Nothing with us yet, unless a test says otherwise. */
const NO_SUMMARY: BuyerPortalSummary = {
  requirements: 0,
  pendingRequirements: 0,
  quotations: 0,
  documents: 0,
}

function renderOverview(
  over: Partial<PortalOverviewView> = {},
  summary: BuyerPortalSummary = NO_SUMMARY,
) {
  return renderWithProviders(<PortalOverview view={{ ...VIEW, ...over }} summary={summary} />, {
    roles: ['EXTERNAL_PARTY'],
  })
}

describe('the portal overview shows the buyer their own context', () => {
  it('names the company', () => {
    renderOverview()
    expect(screen.getByText('Global Foods')).toBeInTheDocument()
  })

  it('shows the party type it was given', () => {
    // The label is derived upstream from the resolved `partyType`; the component
    // renders what it is handed rather than deciding it.
    renderOverview()
    expect(screen.getByText('Buyer')).toBeInTheDocument()
  })

  it('shows the country when there is one', () => {
    renderOverview()
    expect(screen.getByText('Country')).toBeInTheDocument()
    expect(screen.getByText('GB')).toBeInTheDocument()
  })

  it('omits the country block entirely when there is none', () => {
    // An empty row would claim we know a fact about the company that we do not.
    renderOverview({ country: null })
    expect(screen.queryByText('Country')).not.toBeInTheDocument()
  })

  it('greets the viewer by their own identity', () => {
    renderOverview({ signedInAs: 'buyer@example.test' })
    expect(screen.getByText(/buyer@example\.test/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderOverview()
    await expectNoAxeViolations(container)
  })
})

describe('the display projection carries no identifiers', () => {
  it('accepts exactly the four approved fields', () => {
    // Asserted as the whole key set rather than a list of absences, so a field
    // added to the view model later fails here rather than reaching a buyer.
    expect(Object.keys(VIEW).sort()).toEqual([
      'companyName',
      'country',
      'partyTypeLabel',
      'signedInAs',
    ])
  })

  it.each(['accountId', 'organizationId', 'userId', 'legalName'])(
    'has no %s on the view model',
    (key) => {
      expect(VIEW).not.toHaveProperty(key)
    },
  )

  it('renders none of the server-side identifiers, even if one were smuggled in', () => {
    // The component is handed a view model polluted with every identifier the
    // context holds. Nothing renders them, so nothing reaches the DOM - this is
    // what fails if somebody later spreads `party` into the markup.
    const { container } = renderWithProviders(
      <PortalOverview
        view={{ ...VIEW, ...FORBIDDEN_IDS } as PortalOverviewView}
        summary={NO_SUMMARY}
      />,
      { roles: ['EXTERNAL_PARTY'] },
    )

    const rendered = container.innerHTML
    for (const [key, value] of Object.entries(FORBIDDEN_IDS)) {
      expect(rendered, `must not render ${key}`).not.toContain(value)
    }
  })

  it('renders no internal account fields', () => {
    // The values a raw Account record would have carried through.
    const { container } = renderOverview()
    const rendered = container.innerHTML

    for (const leak of [
      'Global Foods Limited', // legalName - excluded by the Batch C contract
      'PROSPECT',
      'ACTIVE',
      'APPROVED',
      'PUBLIC_REGISTRATION',
      'manager@triyara.test',
    ]) {
      expect(rendered, `must not disclose ${leak}`).not.toContain(leak)
    }
  })
})

/**
 * How the page is allowed to reach a buyer's data.
 *
 * These read the page's own source, which is unusual and deliberate. Mutation
 * testing found the hole: a version of the page that imported
 * `accountRepository` directly, skipped `portalContextService.resolve`
 * altogether and rendered `legalName` type-checked cleanly and passed every
 * behavioural test above - because those test the component, and the component
 * was still being handed a well-formed view model.
 *
 * What such a page would silently drop is everything the resolver does between
 * the session and the record: the APPROVED gate, the supplier-only and
 * dual-profile refusals, and the organization scope. None of that is visible
 * from the rendered output, so nothing short of looking at the imports can
 * catch it.
 */
describe('the page reaches account data only through the portal context', () => {
  const source = readFileSync(join(__dirname, '../../../../app/(portal)/portal/page.tsx'), 'utf8')

  /**
   * The source with comments removed.
   *
   * The page documents in prose why it takes no `params` or `searchParams`, and
   * a bare substring search finds those words in the explanation. Asserting on
   * code only keeps the check honest in both directions - it cannot pass because
   * of a comment, and it cannot fail because of one.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('resolves through the portal context service', () => {
    expect(code).toContain('portalContextService.resolve')
  })

  it('imports no repository or database package', () => {
    // The bypass this exists for. A repository import means the page is
    // deciding for itself what a buyer may see, skipping the APPROVED gate, the
    // supplier and dual refusals, and the organization scope.
    expect(code).not.toContain('@triyara/db')
    for (const repo of [
      'accountRepository',
      'buyerProfileRepository',
      'supplierProfileRepository',
    ]) {
      expect(code, `page must not import ${repo}`).not.toContain(repo)
    }
  })

  it('takes no props, so no URL input can choose the account', () => {
    // `searchParams` or `params` here would be caller-controlled input in the
    // one place that must have none.
    expect(code).toContain('export default async function Page()')
    expect(code).not.toContain('searchParams')
    expect(code).not.toContain('params')
  })
})

/**
 * The summary tiles.
 *
 * A count is a way in to a page, not a fact on its own, so what matters is that
 * each number is shown against the right label and links to the page that will
 * show the same rows. The numbers themselves are the service's business and are
 * asserted there.
 */
const SUMMARY: BuyerPortalSummary = {
  requirements: 3,
  pendingRequirements: 1,
  quotations: 2,
  documents: 5,
}

describe('the overview summarises what the buyer has with us', () => {
  it.each([
    ['Requirements', '3', '/portal/requirements'],
    ['Quotations', '2', '/portal/quotations'],
    ['Documents', '5', '/portal/documents'],
  ])('shows %s as %s and links to its page', (label, count, href) => {
    renderOverview({}, SUMMARY)
    const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
    expect(link).toHaveAttribute('href', href)
    expect(link).toHaveTextContent(count)
  })

  it('says how many enquiries are still being reviewed', () => {
    renderOverview({}, SUMMARY)
    expect(screen.getByText(/1 awaiting review/i)).toBeInTheDocument()
  })

  it('stays silent about pending work when there is none', () => {
    renderOverview({}, { ...SUMMARY, pendingRequirements: 0 })
    expect(screen.queryByText(/awaiting review/i)).not.toBeInTheDocument()
  })

  it('shows an honest zero rather than hiding the tile', () => {
    // A buyer with nothing yet should still see where things will appear.
    renderOverview({}, { requirements: 0, pendingRequirements: 0, quotations: 0, documents: 0 })
    const link = screen.getByRole('link', { name: /requirements/i })
    expect(link).toHaveTextContent('0')
  })

  it('offers a way to send a new requirement', () => {
    renderOverview({}, SUMMARY)
    expect(screen.getByRole('link', { name: /new requirement/i })).toHaveAttribute(
      'href',
      '/portal/requirements/new',
    )
  })

  it('has no accessibility violations with the tiles present', async () => {
    const { container } = renderOverview({}, SUMMARY)
    await expectNoAxeViolations(container)
  })

  it('renders no identifier even when the summary object carries some', () => {
    const polluted = {
      ...SUMMARY,
      accountId: 'acct-internal-1',
      organizationId: 'org-internal-1',
      userId: 'u-internal-1',
    } as unknown as BuyerPortalSummary

    const { container } = renderOverview({}, polluted)
    const rendered = container.innerHTML
    for (const leak of ['acct-internal-1', 'org-internal-1', 'u-internal-1']) {
      expect(rendered, `must not render ${leak}`).not.toContain(leak)
    }
  })
})
