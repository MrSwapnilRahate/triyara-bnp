'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../lib/cn'
import { Button } from './button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

export interface PaginationControlsProps {
  /** Rows on the current page. */
  count: number
  limit: number
  onLimitChange?: (limit: number) => void
  /** Cursor for the next page, or null when this is the last one. */
  nextCursor: string | null
  onNext: () => void
  onPrevious: () => void
  /** True when a previous cursor exists on the caller's stack. */
  hasPrevious: boolean
  loading?: boolean
  pageSizes?: number[]
  className?: string
}

/**
 * Cursor (keyset) pagination, presented honestly.
 *
 * The APIs return a next cursor and nothing else - no total, no page count. So
 * there is deliberately no "Page 3 of 47": rendering that would mean either
 * lying or forcing an expensive count query on every page.
 */
export function PaginationControls({
  count,
  limit,
  onLimitChange,
  nextCursor,
  onNext,
  onPrevious,
  hasPrevious,
  loading,
  pageSizes = [25, 50, 100],
  className,
}: PaginationControlsProps) {
  return (
    <div className={cn('gap-gap flex w-full flex-wrap items-center justify-between', className)}>
      <div className="gap-gap text-content-muted flex items-center text-xs">
        <span aria-live="polite">
          {count === 0 ? 'No rows' : `${count} row${count === 1 ? '' : 's'} on this page`}
        </span>
        {onLimitChange ? (
          <span className="gap-gap flex items-center">
            <span className="sr-only" id="page-size-label">
              Rows per page
            </span>
            <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
              <SelectTrigger size="sm" className="w-20" aria-labelledby="page-size-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        ) : null}
      </div>

      <div className="gap-gap flex items-center">
        <Button
          size="sm"
          variant="secondary"
          onClick={onPrevious}
          disabled={!hasPrevious || loading}
          leadingIcon={<ChevronLeft />}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onNext}
          disabled={!nextCursor || loading}
          trailingIcon={<ChevronRight />}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
