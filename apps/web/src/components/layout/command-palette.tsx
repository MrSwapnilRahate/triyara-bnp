'use client'

import { useQuery } from '@tanstack/react-query'
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

import { useDirectory } from '@/features/admin/api/admin'
import { api, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

/**
 * The ⌘K surface for the portal.
 *
 * Two kinds of result, and they are filtered differently. Destinations are a
 * fixed local list, so cmdk matches them here. Records come back already matched
 * by the server, so local filtering is switched off the moment a query is typed
 * - filtering server results again is how a palette shows "no matches" for a
 * record the server just returned.
 *
 * Every module is searched through its own list endpoint. There is no
 * cross-entity search endpoint, and inventing one in the browser would mean
 * five requests pretending to be one, with no way to rank between them.
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
  { id: 'audit', label: 'Audit log', href: '/admin/audit', icon: <ShieldCheck /> },
]

/** Below two characters the server would match almost everything. */
const MIN_QUERY = 2

interface Hit {
  id: string
  primary: string
  secondary: string
  href: string
}

function useRecordSearch(query: string, open: boolean) {
  const q = query.trim()
  const enabled = open && q.length >= MIN_QUERY

  const rfqs = useQuery({
    queryKey: ['search', 'rfqs', q],
    enabled,
    staleTime: STALE_TIME.list,
    queryFn: async ({ signal }) => {
      const r = await api.get<Array<{ id: string; rfqNumber: string; title: string }>>(
        `/api/rfqs${queryString({ q, limit: 5 })}`,
        { signal },
      )
      return (r.data ?? []).map<Hit>((x) => ({
        id: x.id,
        primary: x.title,
        secondary: x.rfqNumber,
        href: `/rfqs/${x.id}`,
      }))
    },
  })

  const quotations = useQuery({
    queryKey: ['search', 'quotations', q],
    enabled,
    staleTime: STALE_TIME.list,
    queryFn: async ({ signal }) => {
      const r = await api.get<Array<{ id: string; quotationNumber: string; title: string }>>(
        `/api/quotations${queryString({ q, limit: 5 })}`,
        { signal },
      )
      return (r.data ?? []).map<Hit>((x) => ({
        id: x.id,
        primary: x.title,
        secondary: x.quotationNumber,
        href: `/quotations/${x.id}`,
      }))
    },
  })

  const suppliers = useQuery({
    queryKey: ['search', 'suppliers', q],
    enabled,
    staleTime: STALE_TIME.list,
    queryFn: async ({ signal }) => {
      const r = await api.get<Array<{ id: string; supplierCode: string; companyName: string }>>(
        `/api/suppliers/search${queryString({ q, limit: 5 })}`,
        { signal },
      )
      return (r.data ?? []).map<Hit>((x) => ({
        id: x.id,
        primary: x.companyName,
        secondary: x.supplierCode,
        href: `/suppliers/${x.id}`,
      }))
    },
  })

  const products = useQuery({
    queryKey: ['search', 'products', q],
    enabled,
    staleTime: STALE_TIME.list,
    queryFn: async ({ signal }) => {
      const r = await api.get<Array<{ id: string; sku: string; name: string }>>(
        `/api/catalog/products${queryString({ q, limit: 5 })}`,
        { signal },
      )
      return (r.data ?? []).map<Hit>((x) => ({
        id: x.id,
        primary: x.name,
        secondary: x.sku,
        href: `/catalog/products/${x.id}`,
      }))
    },
  })

  const users = useDirectory(q, enabled)

  return {
    enabled,
    loading:
      rfqs.isFetching ||
      quotations.isFetching ||
      suppliers.isFetching ||
      products.isFetching ||
      users.isFetching,
    groups: [
      { heading: 'RFQs', hits: rfqs.data ?? [] },
      { heading: 'Quotations', hits: quotations.data ?? [] },
      { heading: 'Suppliers', hits: suppliers.data ?? [] },
      { heading: 'Products', hits: products.data ?? [] },
      {
        heading: 'People',
        hits: (users.data ?? []).map<Hit>((u) => ({
          id: u.id,
          primary: u.name,
          secondary: u.email,
          // The directory is a lookup, not a profile: there is no user detail
          // screen to open, so a hit points at the audit trail they appear in.
          href: `/admin/audit?actorId=${u.id}`,
        })),
      },
    ],
  }
}

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

  const search = useRecordSearch(query, open)

  const groups = useMemo<CommandGroup[]>(() => {
    const go = (href: string) => {
      onOpenChange(false)
      router.push(href)
    }

    const destinations: CommandGroup = {
      heading: 'Go to',
      items: DESTINATIONS.filter(
        // Local filtering is done here because it is switched off globally once
        // a search is running.
        (d) => !search.enabled || d.label.toLowerCase().includes(query.trim().toLowerCase()),
      ).map((d) => ({
        id: d.id,
        label: d.label,
        icon: d.icon,
        onSelect: () => go(d.href),
      })),
    }

    const records: CommandGroup[] = search.enabled
      ? search.groups
          .filter((g) => g.hits.length > 0)
          .map((g) => ({
            heading: g.heading,
            items: g.hits.map((hit) => ({
              id: `${g.heading}-${hit.id}`,
              label: hit.primary,
              hint: hit.secondary,
              onSelect: () => go(hit.href),
            })),
          }))
      : []

    return [destinations, ...records].filter((g) => g.items.length > 0)
  }, [onOpenChange, query, router, search.enabled, search.groups])

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      loading={search.loading}
      // Off once records are in play: the server has already matched them.
      shouldFilter={false}
      placeholder="Search records, or jump to a screen…"
      emptyMessage={
        query.trim().length > 0 && query.trim().length < MIN_QUERY
          ? 'Keep typing to search records.'
          : 'Nothing matches.'
      }
    />
  )
}
