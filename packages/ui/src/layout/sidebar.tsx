'use client'

import { ChevronsLeft, ChevronsRight } from 'lucide-react'

import { IconButton } from '../components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip'
import { cn } from '../lib/cn'

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  /** Count of things needing action. Totals are noise; work queues are not. */
  badge?: number
  /** Match nested routes as active: /rfqs also lights up for /rfqs/:id. */
  matchNested?: boolean
}

export interface NavGroup {
  /** Omitted for the first, ungrouped items. */
  heading?: string
  items: NavItem[]
}

export interface SidebarProps {
  groups: NavGroup[]
  /** Current pathname, supplied by the app so this package stays router-agnostic. */
  pathname: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  brand?: React.ReactNode
  footer?: React.ReactNode
  linkComponent?: React.ElementType
  className?: string
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchNested === false) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/**
 * Primary navigation. A sidebar rather than a top nav because an ERP has ~30
 * destinations and the module you are in must stay visible.
 *
 * Items the user cannot use are filtered out by the caller before they arrive
 * here - a disabled "Administration" group teaches a read-only user only that
 * something exists they cannot have.
 */
export function Sidebar({
  groups,
  pathname,
  collapsed = false,
  onCollapsedChange,
  brand,
  footer,
  linkComponent: Link = 'a',
  className,
}: SidebarProps) {
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'border-line bg-surface duration-base flex h-full flex-col border-r transition-[width]',
        className,
      )}
      style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
    >
      {brand ? (
        <div
          className={cn(
            'border-line flex h-[--topbar-height] shrink-0 items-center border-b',
            collapsed ? 'px-gap justify-center' : 'px-gap-lg',
          )}
        >
          {brand}
        </div>
      ) : null}

      <nav aria-label="Main" className="px-gap py-gap-lg min-h-0 flex-1 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.heading ?? `group-${gi}`} className={cn(gi > 0 && 'mt-gap-lg')}>
            {group.heading && !collapsed ? (
              <p className="pb-gap pt-gap text-2xs text-content-subtle px-2 font-semibold tracking-wide uppercase">
                {group.heading}
              </p>
            ) : null}
            {group.heading && collapsed && gi > 0 ? (
              <div aria-hidden="true" className="mb-gap-lg bg-line mx-2 h-px" />
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item)
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focus-ring gap-gap flex items-center rounded-sm px-2 py-1.5 text-base',
                      'duration-fast transition-colors',
                      collapsed && 'justify-center px-0',
                      active
                        ? 'bg-accent-subtle text-accent font-medium'
                        : 'text-content-muted hover:bg-surface-sunken hover:text-content',
                      '[&_svg]:size-4 [&_svg]:shrink-0',
                    )}
                  >
                    {item.icon}
                    {collapsed ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {item.badge && item.badge > 0 ? (
                      <span
                        className={cn(
                          'bg-danger text-2xs rounded-full px-1.5 leading-4 font-semibold text-white',
                          collapsed && 'absolute top-1 right-1 min-w-[0.875rem] px-0.5 text-center',
                        )}
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                        <span className="sr-only"> needing attention</span>
                      </span>
                    ) : null}
                  </Link>
                )

                return (
                  <li key={item.href} className={cn(collapsed && 'relative')}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">
                          {item.label}
                          {item.badge ? ` (${item.badge})` : ''}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'border-line p-gap shrink-0 border-t',
          collapsed ? 'flex justify-center' : 'gap-gap flex items-center justify-between',
        )}
      >
        {collapsed ? null : footer}
        {onCollapsedChange ? (
          <IconButton
            size="sm"
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </IconButton>
        ) : null}
      </div>
    </aside>
  )
}
