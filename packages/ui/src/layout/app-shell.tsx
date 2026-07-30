'use client'

import { useEffect, useState } from 'react'

import { Drawer, DrawerContent } from '../components/drawer'
import { cn } from '../lib/cn'

export interface AppShellProps {
  /** Sidebar element. Rendered persistently at md+, in a drawer below that. */
  sidebar: React.ReactNode
  /** TopBar element. */
  topBar: React.ReactNode
  children: React.ReactNode
  /** Right-hand context panel, route-driven by the caller. */
  detailPanel?: React.ReactNode
  className?: string
}

const COLLAPSE_KEY = 'triyara.sidebar.collapsed'

/** Persisted collapse state, for the app to feed into <Sidebar collapsed>. */
export function useSidebarCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === 'true')
  }, [])

  function update(value: boolean) {
    setCollapsed(value)
    localStorage.setItem(COLLAPSE_KEY, String(value))
  }

  return [collapsed, update]
}

/** Mobile navigation drawer state, so TopBar and AppShell agree on one source. */
export function useNavDrawer(): {
  open: boolean
  setOpen: (open: boolean) => void
  onMenuClick: () => void
} {
  const [open, setOpen] = useState(false)
  return { open, setOpen, onMenuClick: () => setOpen(true) }
}

/**
 * The authenticated frame: persistent sidebar, sticky top bar, scrolling main.
 *
 * Below md the sidebar becomes a drawer rather than compressing - a squeezed
 * 30-destination nav is unusable, and Radix Dialog gives the drawer correct focus
 * trapping for free.
 */
export function AppShell({ sidebar, topBar, children, detailPanel, className }: AppShellProps) {
  return (
    <div className={cn('ds-root bg-canvas text-content flex h-screen overflow-hidden', className)}>
      <div className="hidden shrink-0 md:block">{sidebar}</div>

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}
        <div className="flex min-h-0 flex-1">
          <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
          {detailPanel ? (
            <aside className="border-line bg-surface hidden w-96 shrink-0 overflow-y-auto border-l xl:block">
              {detailPanel}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Mobile navigation drawer. Rendered by the app alongside AppShell. */
export function NavDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="left" width="sm" className="md:hidden" aria-label="Navigation">
        {children}
      </DrawerContent>
    </Drawer>
  )
}

/** Skip link. First focusable element on the page, visible only on focus. */
export function SkipToContent({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        'sr-only focus:not-sr-only',
        'focus:z-max focus:left-gap-lg focus:top-gap-lg focus:fixed',
        'focus:bg-accent focus:text-accent-fg focus:rounded-sm focus:px-3 focus:py-2 focus:text-base',
      )}
    >
      Skip to content
    </a>
  )
}

/** Standard page body padding, so every screen agrees on gutters. */
export function PageBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-gutter', className)} {...props} />
}
