'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The buyer's way around their own portal.
 *
 * A static list, and deliberately not the internal `NAVIGATION` registry. That
 * one declares a CASL ability per item and filters out what the viewer cannot
 * use - a mechanism that would render an EMPTY menu here, because EXTERNAL_PARTY
 * holds no rule at all. What keeps this safe is not capability but the route
 * boundary: every href below is inside `/portal`, and `authorized()` sends any
 * internal session that reaches for one back to `/dashboard`.
 *
 * Three entries, because there are three screens. Orders, shipments, messages,
 * documents and anything supplier-shaped are absent rather than disabled - a
 * link that 404s teaches a buyer only that something exists they cannot have,
 * and the whole point of this portal is that the supplier side is not theirs to
 * reach.
 *
 * No counts and no badges. A number here would need a portal-scoped read model
 * that does not exist, and the overview page already records why an invented
 * one would be worse than an honest absence.
 */
export interface PortalNavItem {
  readonly label: string
  readonly href: string
  /**
   * Match this href and nothing beneath it.
   *
   * Only `/portal` sets it. Every other route in the portal begins with
   * `/portal`, so a prefix match on the overview would light it up on every
   * page in the portal at once.
   */
  readonly exact?: boolean
}

export const PORTAL_NAV_ITEMS: readonly PortalNavItem[] = [
  { label: 'Overview', href: '/portal', exact: true },
  { label: 'Requirements', href: '/portal/requirements' },
  { label: 'Quotations', href: '/portal/quotations' },
  { label: 'Documents', href: '/portal/documents' },
]

/**
 * Whether this item is the page being viewed.
 *
 * The nested match compares against `href + '/'` rather than `href` alone. A
 * bare `startsWith` would light Requirements up on `/portal/requirementsX` -
 * the same near-miss the route policy already guards against with
 * `/portalling`, and worth guarding here for the same reason: a nav that claims
 * the wrong page is telling the reader something untrue about where they are.
 *
 * Exported so the matching can be asserted directly, without a render.
 */
export function isPortalNavItemActive(pathname: string, item: PortalNavItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function PortalNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Portal">
      {/* A list, so a screen reader announces how many destinations there are
          before reading them. Wraps on a narrow viewport rather than
          collapsing into a drawer - three short labels do not need one. */}
      <ul className="flex flex-wrap items-center gap-gap-lg">
        {PORTAL_NAV_ITEMS.map((item) => {
          const active = isPortalNavItemActive(pathname, item)

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                // `undefined` rather than `'false'`: the attribute is absent on
                // every other item, which is what the ARIA contract asks for.
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'border-b-2 border-content pb-1 text-sm font-medium text-content'
                    : 'border-b-2 border-transparent pb-1 text-sm text-content-muted hover:text-content'
                }
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
