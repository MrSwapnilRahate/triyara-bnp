import type { BreadcrumbItem } from '@triyara/ui'

/**
 * Route-derived breadcrumb (TRY-BNP-PORTAL-01 §4).
 *
 * A segment that looks like an opaque id is rendered as a loading placeholder
 * rather than as the id itself: "RFQs / clx7f… / Responses" is worse than
 * showing nothing while the business identifier resolves from the detail cache.
 * Feature screens override the label once they have it.
 */
const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  catalog: 'Catalog',
  products: 'Products',
  categories: 'Categories',
  specifications: 'Specifications',
  tags: 'Tags',
  suppliers: 'Suppliers',
  rfqs: 'RFQs',
  quotations: 'Quotations',
  accounts: 'Accounts',
  verifications: 'Verifications',
  documents: 'Documents',
  activity: 'Activity',
  notifications: 'Notifications',
  admin: 'Administration',
  users: 'Users',
  roles: 'Roles',
  sessions: 'Sessions',
  organization: 'Organization',
  audit: 'Audit log',
  'api-docs': 'API docs',
  new: 'New',
  items: 'Lines',
  responses: 'Responses',
  compare: 'Comparison',
  revisions: 'Revisions',
}

/** cuid/cuid2/uuid-shaped segments are entity ids, not navigable labels. */
export function looksLikeId(segment: string): boolean {
  return (
    /^c[a-z0-9]{20,}$/i.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
  )
}

export function humanise(segment: string): string {
  return LABELS[segment] ?? segment.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export function buildBreadcrumb(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return []

  const items: BreadcrumbItem[] = []
  let href = ''

  for (const [index, segment] of segments.entries()) {
    href += `/${segment}`
    const last = index === segments.length - 1

    if (looksLikeId(segment)) {
      items.push({ label: '', loading: true, ...(last ? {} : { href }) })
      continue
    }

    items.push({ label: humanise(segment), ...(last ? {} : { href }) })
  }

  return items
}
