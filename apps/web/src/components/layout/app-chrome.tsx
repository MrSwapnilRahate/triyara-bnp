'use client'

import {
  AppShell,
  Breadcrumb,
  type BreadcrumbItem,
  NavDrawer,
  NotificationCenter,
  Sidebar,
  SkipToContent,
  TopBar,
  useNavDrawer,
  UserMenu,
  useSidebarCollapsed,
  useTheme,
} from '@triyara/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useMemo, useState } from 'react'

import { useAbility } from '@/lib/ability-context'

import { Brand } from './brand'
import { buildBreadcrumb } from './breadcrumb'
import { PortalCommandPalette } from './command-palette'
import { visibleNavigation } from './navigation'
import { OrganizationBadge } from './organization-badge'

export interface ChromeUser {
  name: string
  email: string
  roles: string[]
}

export interface AppChromeProps {
  user: ChromeUser
  organization: { id: string; name: string; hint?: string }
  /** Sign-out form, rendered by the server layout so it can use a server action. */
  signOutSlot?: ReactNode
  children: ReactNode
}

/**
 * Assembles the authenticated frame from @triyara/ui parts and the Next-specific
 * bits (Link, usePathname) that must not live in the design-system package.
 *
 * Notification data and nav badges are placeholders in this wave: their queries
 * arrive with the feature that owns them (§30 Wave 7). The components are wired
 * and correct; only the source is stubbed, and that is stated rather than made
 * to look live.
 */
export function AppChrome({ user, organization, signOutSlot, children }: AppChromeProps) {
  const pathname = usePathname() ?? '/'
  const ability = useAbility()
  const { theme, setTheme, density, setDensity } = useTheme()
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  const drawer = useNavDrawer()
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Badges are work-queue counts, not totals. Empty until the queries that feed
  // them exist; an invented number would be worse than none.
  const groups = useMemo(() => visibleNavigation(ability, {}), [ability])

  const crumbs: BreadcrumbItem[] = useMemo(() => buildBreadcrumb(pathname), [pathname])

  const sidebar = (
    <Sidebar
      groups={groups}
      pathname={pathname}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      brand={<Brand showWordmark={!collapsed} />}
      footer={<OrganizationBadge organization={organization} />}
      linkComponent={Link}
      className="h-full"
    />
  )

  return (
    <>
      <SkipToContent />
      <AppShell
        sidebar={sidebar}
        topBar={
          <TopBar
            onMenuClick={drawer.onMenuClick}
            breadcrumb={<Breadcrumb items={crumbs} linkComponent={Link} />}
            onSearchClick={() => setPaletteOpen(true)}
            searchPlaceholder="Search or jump to…"
            actions={
              <NotificationCenter
                items={[]}
                unreadCount={0}
                viewAllHref="/notifications"
                linkComponent={Link}
              />
            }
            userMenu={
              <UserMenu
                name={user.name}
                email={user.email}
                roles={user.roles}
                theme={theme}
                onThemeChange={setTheme}
                density={density}
                onDensityChange={setDensity}
                signOutSlot={signOutSlot}
                linkComponent={Link}
              />
            }
          />
        }
      >
        {children}
      </AppShell>

      <NavDrawer open={drawer.open} onOpenChange={drawer.setOpen}>
        <Sidebar
          groups={groups}
          pathname={pathname}
          brand={<Brand />}
          linkComponent={Link}
          className="h-full border-r-0"
        />
      </NavDrawer>

      <PortalCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
