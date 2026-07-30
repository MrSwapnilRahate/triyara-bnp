'use client'

import { cn, DataTableHeaderCell } from '@triyara/ui'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { sortDirection } from '@/lib/list-state'

export interface SortableHeaderProps {
  label: string
  /** Omit for a column the API cannot sort. It then renders as plain text. */
  sortKey?: string
  currentSort: string | undefined
  onSort: (key: string) => void
  numeric?: boolean
  className?: string
}

/**
 * A column is sortable only if the API accepts that sort key. Passing no
 * sortKey renders a plain header - the alternative, a clickable header that
 * silently does nothing, is worse than an unsortable one.
 */
export function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  numeric,
  className,
}: SortableHeaderProps) {
  if (!sortKey) {
    return (
      <DataTableHeaderCell className={cn(numeric && 'text-right', className)}>
        {label}
      </DataTableHeaderCell>
    )
  }

  const direction = sortDirection(currentSort, sortKey)
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown

  return (
    <DataTableHeaderCell sortable sortDirection={direction} className={cn('p-0', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'focus-ring flex w-full items-center gap-gap-xs px-gap-lg py-gap',
          'transition-colors duration-instant hover:text-content',
          numeric && 'justify-end',
        )}
      >
        {label}
        <Icon
          aria-hidden="true"
          className={cn('size-3', direction ? 'text-accent' : 'text-content-subtle opacity-60')}
        />
      </button>
    </DataTableHeaderCell>
  )
}
