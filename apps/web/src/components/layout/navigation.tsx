import type { Action, AppAbility, Subject } from '@triyara/auth'
import type { NavGroup, NavItem } from '@triyara/ui'
import {
  Activity,
  Bell,
  BellRing,
  Building2,
  FileSearch,
  FileText,
  FolderTree,
  Gauge,
  Layers,
  Package,
  Quote,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'

/**
 * Navigation registry (TRY-BNP-PORTAL-01 §4).
 *
 * Each item declares the ability it requires. Items the user cannot use are
 * FILTERED OUT, not disabled: a greyed "Administration" group teaches a
 * read-only user only that something exists they cannot have, and the API would
 * refuse them anyway.
 *
 * Screens not yet built are absent from this registry rather than present and
 * broken - a nav item that 404s is worse than one that is missing.
 */
interface GuardedItem extends NavItem {
  /** Omitted means "every authenticated user". */
  requires?: { action: Action; subject: Subject }
}

interface GuardedGroup {
  heading?: string
  items: GuardedItem[]
}

export const NAVIGATION: GuardedGroup[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: <Gauge />, matchNested: false }],
  },
  {
    heading: 'Sourcing',
    items: [
      { label: 'RFQs', href: '/rfqs', icon: <FileSearch /> },
      { label: 'Quotations', href: '/quotations', icon: <Quote /> },
      { label: 'Suppliers', href: '/suppliers', icon: <Truck /> },
    ],
  },
  {
    heading: 'Catalog',
    items: [
      { label: 'Products', href: '/catalog/products', icon: <Package /> },
      { label: 'Categories', href: '/catalog/categories', icon: <FolderTree /> },
      { label: 'Specifications', href: '/catalog/specifications', icon: <Layers /> },
      { label: 'Tags', href: '/catalog/tags', icon: <Tags /> },
    ],
  },
  {
    heading: 'Relationships',
    items: [
      { label: 'Accounts', href: '/accounts', icon: <Users /> },
      { label: 'Verifications', href: '/verifications', icon: <ShieldCheck /> },
      { label: 'Documents', href: '/documents', icon: <FileText /> },
    ],
  },
  {
    heading: 'Activity',
    items: [
      { label: 'Activity feed', href: '/activity', icon: <Activity /> },
      { label: 'Notifications', href: '/notifications', icon: <Bell /> },
    ],
  },
  {
    // Personal settings carry no `requires`: every signed-in user has a
    // profile and notification preferences of their own.
    heading: 'You',
    items: [
      { label: 'My profile', href: '/settings/profile', icon: <UserCog /> },
      { label: 'Notifications', href: '/settings/notifications', icon: <BellRing /> },
    ],
  },
  {
    heading: 'Administration',
    items: [
      {
        label: 'Users',
        href: '/admin/users',
        icon: <Users />,
        requires: { action: 'manage', subject: 'User' },
      },
      // Roles is deliberately absent until /admin/roles exists. The matrix it
      // would show is already reachable on a person's Permissions tab, and a
      // sidebar entry that 404s is worse than one that is missing.
      {
        label: 'Organization',
        href: '/admin/organization',
        icon: <Building2 />,
        requires: { action: 'manage', subject: 'Organization' },
      },
      {
        label: 'Audit log',
        href: '/admin/audit',
        icon: <ScrollText />,
        requires: { action: 'manage', subject: 'Organization' },
      },
      {
        label: 'API docs',
        href: '/admin/api-docs',
        icon: <Settings />,
        requires: { action: 'manage', subject: 'Organization' },
      },
    ],
  },
]

/**
 * Filters the registry against the caller's ability and drops any group left
 * empty, so an entirely forbidden section leaves no orphan heading.
 */
export function visibleNavigation(
  ability: Pick<AppAbility, 'can'>,
  badges: Record<string, number> = {},
): NavGroup[] {
  return NAVIGATION.map((group) => ({
    heading: group.heading,
    items: group.items
      .filter((item) => !item.requires || ability.can(item.requires.action, item.requires.subject))
      .map(({ requires: _requires, ...item }) => ({
        ...item,
        ...(badges[item.href] ? { badge: badges[item.href] } : {}),
      })),
  })).filter((group) => group.items.length > 0)
}
