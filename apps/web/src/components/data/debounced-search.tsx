'use client'

import { SearchInput } from '@triyara/ui'
import { useEffect, useState } from 'react'

export interface DebouncedSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** 250ms matches §15. Long enough to stop per-keystroke requests. */
  delay?: number
  resultSummary?: string
  className?: string
  'aria-label': string
}

/**
 * Local state drives the input so typing stays responsive; the debounced value
 * is what reaches the URL and the query. Without the split, every keystroke
 * would push a history entry and refetch.
 */
export function DebouncedSearch({
  value,
  onChange,
  placeholder = 'Search…',
  delay = 250,
  resultSummary,
  className,
  ...aria
}: DebouncedSearchProps) {
  const [local, setLocal] = useState(value)

  // Re-sync when the URL changes underneath us (back button, filter reset).
  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    if (local === value) return
    const timer = setTimeout(() => onChange(local), delay)
    return () => clearTimeout(timer)
  }, [local, value, delay, onChange])

  return (
    <SearchInput
      {...aria}
      value={local}
      onChange={(event) => setLocal(event.target.value)}
      onClear={() => {
        setLocal('')
        onChange('')
      }}
      placeholder={placeholder}
      resultSummary={resultSummary}
      className={className}
    />
  )
}
