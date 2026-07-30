import { ChevronRight } from 'lucide-react'

import { cn } from '../lib/cn'

export interface BreadcrumbItem {
  label: string
  href?: string
  /** True while the business identifier is still resolving. */
  loading?: boolean
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[]
  /** Injected so the package stays framework-agnostic (Next Link, react-router). */
  linkComponent?: React.ElementType
  /** Collapse the middle when the trail is long. */
  maxItems?: number
}

/**
 * Derived from the route, with entity identifiers resolved from cache. It must
 * read "RFQs / RFQ-2026-000001 / Responses" - never a cuid.
 */
export function Breadcrumb({
  items,
  linkComponent: Link = 'a',
  maxItems = 4,
  className,
  ...props
}: BreadcrumbProps) {
  const collapsed =
    items.length > maxItems
      ? [items[0]!, { label: '…' } satisfies BreadcrumbItem, ...items.slice(-2)]
      : items

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)} {...props}>
      <ol className="gap-gap-xs flex items-center text-xs">
        {collapsed.map((item, i) => {
          const last = i === collapsed.length - 1
          return (
            <li key={`${item.label}-${i}`} className="gap-gap-xs flex min-w-0 items-center">
              {i > 0 ? (
                <ChevronRight aria-hidden="true" className="text-content-subtle size-3 shrink-0" />
              ) : null}
              {item.loading ? (
                <span className="bg-surface-sunken h-3 w-24 animate-pulse rounded-xs" />
              ) : item.href && !last ? (
                <Link
                  href={item.href}
                  className="focus-ring text-content-muted hover:text-content truncate rounded-xs hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    'truncate',
                    last ? 'text-content font-medium' : 'text-content-muted',
                  )}
                  aria-current={last ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
