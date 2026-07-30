'use client'

import { Menu, Search } from 'lucide-react'

import { IconButton } from '../components/button'
import { cn } from '../lib/cn'

export interface TopBarProps {
  /** Breadcrumb trail. */
  breadcrumb?: React.ReactNode
  /** Opens the command palette. */
  onSearchClick?: () => void
  searchPlaceholder?: string
  /** NotificationCenter and anything else that belongs on the right. */
  actions?: React.ReactNode
  /** User menu, rendered last. */
  userMenu?: React.ReactNode
  /** Shown below md to open the navigation drawer. */
  onMenuClick?: () => void
  className?: string
}

/**
 * Context bar: where am I, what am I looking for, what needs me. Navigation
 * lives in the sidebar, so this stays uncluttered.
 *
 * The search control is a BUTTON, not an input: it opens the command palette.
 * An input here would imply typing filters this page, which it does not.
 */
export function TopBar({
  breadcrumb,
  onSearchClick,
  searchPlaceholder = 'Search…',
  actions,
  userMenu,
  onMenuClick,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        'z-sticky gap-gap-lg sticky top-0 flex h-[--topbar-height] shrink-0 items-center',
        'border-line bg-surface/95 px-gap-lg border-b backdrop-blur',
        className,
      )}
    >
      {onMenuClick ? (
        <IconButton label="Open navigation" onClick={onMenuClick} className="md:hidden">
          <Menu />
        </IconButton>
      ) : null}

      <div className="min-w-0 flex-1">{breadcrumb}</div>

      {onSearchClick ? (
        <button
          type="button"
          onClick={onSearchClick}
          className={cn(
            'focus-ring gap-gap border-line bg-surface-sunken hidden items-center rounded-sm border',
            'text-content-subtle duration-fast px-2.5 py-1.5 text-xs transition-colors',
            'hover:border-line-strong hover:text-content-muted sm:flex',
          )}
        >
          <Search aria-hidden="true" className="size-3.5" />
          <span>{searchPlaceholder}</span>
          <kbd className="ml-gap-lg text-2xs font-mono tracking-widest">⌘K</kbd>
        </button>
      ) : null}

      {onSearchClick ? (
        <IconButton label="Search" onClick={onSearchClick} className="sm:hidden">
          <Search />
        </IconButton>
      ) : null}

      {actions}
      {userMenu}
    </header>
  )
}
