import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  isPortalNavItemActive,
  PORTAL_NAV_ITEMS,
  PortalNav,
} from '@/features/portal/components/portal-nav'
import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * The buyer's way around their own portal.
 *
 * Two properties matter more than the rendering. The first is that every
 * destination stays inside `/portal` - this menu is shown to somebody who holds
 * no CASL rule at all, so an internal href would be a link into a namespace the
 * route policy exists to keep them out of. The second is that the active mark
 * tells the truth: `aria-current="page"` is what a screen reader announces as
 * "current page", and a nav that claims the wrong one is worse than a nav with
 * no marking.
 */

const mockPathname = vi.fn<() => string>(() => '/portal')
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname() }))

function renderNav(pathname: string) {
  mockPathname.mockReturnValue(pathname)
  return renderWithProviders(<PortalNav />, { roles: ['EXTERNAL_PARTY'] })
}

function currentLabel(): string | null {
  const marked = screen
    .queryAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
  expect(marked.length, 'exactly one item may be marked current').toBeLessThanOrEqual(1)
  return marked[0]?.textContent ?? null
}

describe('the portal navigation offers the three screens the buyer has', () => {
  it('renders every item', () => {
    renderNav('/portal')
    for (const label of ['Overview', 'Requirements', 'Quotations']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('offers exactly three destinations, and no more', () => {
    // The absences are the point: orders, shipments, messages, documents and
    // anything supplier-shaped are not built, and a link that 404s teaches a
    // buyer only that something exists they cannot have.
    renderNav('/portal')
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('names a landmark a screen reader can jump to', () => {
    renderNav('/portal')
    expect(screen.getByRole('navigation', { name: 'Portal' })).toBeInTheDocument()
  })

  it('announces how many destinations there are, as a list', () => {
    renderNav('/portal')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})

describe('every destination stays inside the portal', () => {
  it.each(PORTAL_NAV_ITEMS.map((i) => [i.label, i.href]))(
    '%s points at %s, which is inside /portal',
    (_label, href) => {
      expect(href.startsWith('/portal')).toBe(true)
    },
  )

  it('renders no href outside /portal', () => {
    // Asserted on what actually reaches the DOM, not only on the registry, so
    // a hand-written link added to the markup is caught too.
    renderNav('/portal')
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^\/portal(\/|$)/)
    }
  })

  it.each([
    '/dashboard',
    '/accounts',
    '/suppliers',
    '/rfqs',
    '/quotations',
    '/verifications',
    '/admin',
  ])('never links to the internal route %s', (internal) => {
    renderNav('/portal')
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain(internal)
  })
})

describe('the active item tells the truth about where you are', () => {
  it('marks Overview on the portal home', () => {
    renderNav('/portal')
    expect(currentLabel()).toBe('Overview')
  })

  it('does NOT mark Overview on a page beneath it', () => {
    // The whole reason Overview matches exactly. Every portal route begins with
    // `/portal`, so a prefix match would light it up everywhere at once.
    renderNav('/portal/requirements')
    expect(currentLabel()).toBe('Requirements')
  })

  it.each([
    '/portal/requirements',
    '/portal/requirements/RFQ-0001',
    '/portal/requirements/RFQ%2F1',
  ])('marks Requirements on %s', (pathname) => {
    renderNav(pathname)
    expect(currentLabel()).toBe('Requirements')
  })

  it.each(['/portal/quotations', '/portal/quotations/QT-0001', '/portal/quotations/QT%2F1'])(
    'marks Quotations on %s',
    (pathname) => {
      renderNav(pathname)
      expect(currentLabel()).toBe('Quotations')
    },
  )

  it('leaves every other item unmarked', () => {
    renderNav('/portal/quotations')
    const unmarked = screen
      .getAllByRole('link')
      .filter((a) => a.textContent !== 'Quotations')
      .map((a) => a.getAttribute('aria-current'))
    expect(unmarked).toEqual([null, null])
  })

  it('marks nothing on a portal route that is not one of the three', () => {
    renderNav('/portal/something-else')
    expect(currentLabel()).toBeNull()
  })
})

describe('nested matching does not overreach', () => {
  it.each([
    ['/portal', { label: 'Overview', href: '/portal', exact: true }, true],
    ['/portal/requirements', { label: 'Overview', href: '/portal', exact: true }, false],
    ['/portal/requirements', { label: 'R', href: '/portal/requirements' }, true],
    ['/portal/requirements/RFQ-1', { label: 'R', href: '/portal/requirements' }, true],
    // The near-miss. A bare `startsWith` would call this a match, the same way
    // `/portalling` would have matched `/portal` before the route policy fixed it.
    ['/portal/requirementsX', { label: 'R', href: '/portal/requirements' }, false],
    ['/portal/quotationsX', { label: 'Q', href: '/portal/quotations' }, false],
    ['/portalling', { label: 'Overview', href: '/portal', exact: true }, false],
  ])('%s against %o is %s', (pathname, item, expected) => {
    expect(isPortalNavItemActive(pathname, item)).toBe(expected)
  })
})

describe('accessibility', () => {
  it('has no violations', async () => {
    const { container } = renderNav('/portal')
    await expectNoAxeViolations(container)
  })

  it('has no violations on a nested page', async () => {
    const { container } = renderNav('/portal/requirements/RFQ-0001')
    await expectNoAxeViolations(container)
  })
})

/**
 * What the portal navigation is allowed to depend on.
 *
 * Source-level, because none of this is visible in rendered output. The
 * internal registry filters each item by a CASL ability, and EXTERNAL_PARTY
 * holds none - importing it would render an empty menu, or worse, be "fixed"
 * later by granting the role an ability. The safety here is the route
 * boundary, and these assertions keep it that way.
 */
describe('the portal navigation imports no internal infrastructure', () => {
  const source = readFileSync(join(__dirname, '../portal-nav.tsx'), 'utf8')
  // Comments stripped, so the check can neither pass nor fail on prose - the
  // file explains why it avoids these things by name.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it.each([
    'NAVIGATION',
    'visibleNavigation',
    'AppChrome',
    'useAbility',
    'AbilityProvider',
    'Sidebar',
    'NavDrawer',
    'AppShell',
  ])('does not reference %s', (token) => {
    expect(code).not.toContain(token)
  })

  it('reaches no service, repository or database', () => {
    expect(code).not.toContain('@triyara/db')
    expect(code).not.toContain('@triyara/core')
    expect(code).not.toContain('buyerPortalService')
    expect(code).not.toContain('portalContextService')
    expect(code).not.toContain('prisma')
  })

  it('fetches nothing', () => {
    // Static hrefs. No query client, no fetch, no counts - a badge would need a
    // portal-scoped read model that does not exist.
    expect(code).not.toContain('useQuery')
    expect(code).not.toContain('fetch(')
    expect(code).not.toContain('badge')
  })

  it('hardcodes no internal href', () => {
    for (const internal of ['/dashboard', '/accounts', '/suppliers', '/rfqs', '/admin']) {
      expect(code).not.toContain(`'${internal}`)
    }
  })
})

/**
 * The shell the navigation sits in.
 *
 * The guards are the reason the navigation can be a static list at all, so they
 * are asserted here rather than assumed: the layout fails closed before a link
 * is ever rendered.
 */
describe('the portal layout keeps its guards and hosts the skip link', () => {
  const source = readFileSync(join(__dirname, '../../../../app/(portal)/layout.tsx'), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('still requires a session', () => {
    expect(code).toContain('requireAuth()')
  })

  it('still requires an external account, not merely the role', () => {
    expect(code).toContain('requireExternalAccountContext(ctx)')
  })

  it('renders the portal navigation', () => {
    expect(code).toContain('<PortalNav />')
  })

  it('offers a skip link, and targets the main region', () => {
    expect(code).toContain('<SkipToContent />')
    expect(code).toContain('id="main-content"')
  })

  it('places the skip link before the navigation', () => {
    // Otherwise a keyboard user tabs through every nav link to reach it, which
    // is the situation a skip link exists to prevent.
    expect(code.indexOf('<SkipToContent />')).toBeLessThan(code.indexOf('<PortalNav />'))
  })

  it('keeps sign-out where it was', () => {
    expect(code).toContain('logoutAction')
    expect(code).toContain('<SignOutButton />')
  })

  it('does not reach for the internal chrome', () => {
    expect(code).not.toContain('AppChrome')
    expect(code).not.toContain('AbilityProvider')
    expect(code).not.toContain('useAbility')
  })
})
