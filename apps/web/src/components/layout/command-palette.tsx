'use client'

import { type CommandGroup, CommandPalette, useCommandShortcut } from '@triyara/ui'
import {
  FileSearch,
  FolderTree,
  Gauge,
  Package,
  Quote,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

/**
 * The ⌘K surface for the portal.
 *
 * This wave wires NAVIGATION only. Record search fans out to the four module
 * list endpoints (§15) and arrives with those features - a palette that searched
 * an API no screen can display yet would be a dead end. Static destinations are
 * the majority of invocations anyway, so this is useful on its own.
 */
const DESTINATIONS = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <Gauge /> },
  { id: 'rfqs', label: 'RFQs', href: '/rfqs', icon: <FileSearch /> },
  { id: 'quotations', label: 'Quotations', href: '/quotations', icon: <Quote /> },
  { id: 'suppliers', label: 'Suppliers', href: '/suppliers', icon: <Truck /> },
  { id: 'products', label: 'Products', href: '/catalog/products', icon: <Package /> },
  { id: 'categories', label: 'Categories', href: '/catalog/categories', icon: <FolderTree /> },
  { id: 'accounts', label: 'Accounts', href: '/accounts', icon: <Users /> },
  { id: 'verifications', label: 'Verifications', href: '/verifications', icon: <ShieldCheck /> },
]

export function PortalCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  useCommandShortcut(useCallback(() => onOpenChange(true), [onOpenChange]))

  const groups = useMemo<CommandGroup[]>(
    () => [
      {
        heading: 'Go to',
        items: DESTINATIONS.map((d) => ({
          id: d.id,
          label: d.label,
          icon: d.icon,
          onSelect: () => router.push(d.href),
        })),
      },
    ],
    [router],
  )

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      // Destinations are a fixed local list, so cmdk filters them here. Remote
      // record search will arrive as its own group with filtering disabled.
      shouldFilter
      placeholder="Jump to a screen…"
      emptyMessage="No matching screen."
    />
  )
}
