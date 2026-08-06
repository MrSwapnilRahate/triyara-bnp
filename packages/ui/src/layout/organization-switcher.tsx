'use client'

import { Building2, Check, ChevronsUpDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/dropdown-menu'
import { cn } from '../lib/cn'

export interface OrganizationOption {
  id: string
  name: string
  /** Rendered under the name; a slug or legal identifier. */
  hint?: string
}

export interface OrganizationSwitcherProps {
  current: OrganizationOption
  /** When one or fewer, the control renders as a static label rather than a menu. */
  organizations?: OrganizationOption[]
  onSelect?: (id: string) => void
  collapsed?: boolean
  className?: string
}

/**
 * UI ONLY, by design.
 *
 * The platform is single-tenant per session today: the organization comes from
 * the session and every API call is scoped to it server-side. There is no
 * endpoint to switch organizations, so this control renders the current one and
 * only becomes a menu once more than one is supplied. Wiring a switcher that
 * appeared to work but changed nothing would be worse than not having one -
 * and switching would additionally have to clear the query cache, which holds
 * another tenant's data.
 */
export function OrganizationSwitcher({
  current,
  organizations,
  onSelect,
  collapsed,
  className,
}: OrganizationSwitcherProps) {
  const switchable = Boolean(organizations && organizations.length > 1 && onSelect)

  const body = (
    <>
      <span
        aria-hidden="true"
        className="bg-accent-subtle text-accent flex size-6 shrink-0 items-center justify-center rounded-sm [&_svg]:size-3.5"
      >
        <Building2 />
      </span>
      {collapsed ? (
        <span className="sr-only">{current.name}</span>
      ) : (
        <span className="min-w-0 flex-1 text-left">
          <span className="text-content block truncate text-base font-medium">{current.name}</span>
          {current.hint ? (
            <span className="text-2xs text-content-subtle block truncate">{current.hint}</span>
          ) : null}
        </span>
      )}
    </>
  )

  if (!switchable) {
    return (
      <div
        className={cn('gap-gap flex items-center rounded-sm px-1 py-1', className)}
        title={current.name}
      >
        {body}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Organization: ${current.name}. Change organization`}
          className={cn(
            'focus-ring gap-gap flex w-full items-center rounded-sm px-1 py-1',
            'duration-fast hover:bg-surface-sunken transition-colors',
            className,
          )}
        >
          {body}
          {collapsed ? null : (
            <ChevronsUpDown aria-hidden="true" className="text-content-subtle size-3.5 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations!.map((org) => (
          <DropdownMenuItem key={org.id} onSelect={() => onSelect!(org.id)}>
            <Check className={cn(org.id === current.id ? 'opacity-100' : 'opacity-0')} />
            <span className="min-w-0">
              <span className="block truncate">{org.name}</span>
              {org.hint ? (
                <span className="text-content-subtle block truncate text-xs">{org.hint}</span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
