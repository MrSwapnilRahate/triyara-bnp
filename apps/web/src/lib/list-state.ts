'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useRef } from 'react'

/**
 * List state lives in the URL (TRY-BNP-PORTAL-01 §2, §16).
 *
 * Filters, sort and the cursor are search params so a filtered view is
 * linkable, bookmarkable and survives a refresh - and so the back button
 * behaves. Nothing here is duplicated into React state.
 *
 * The cursor STACK is the exception: keyset pagination gives a forward cursor
 * only, so going back needs the trail we came by. It is deliberately ephemeral -
 * a shared link opens at the first page rather than pretending to restore a
 * position the API cannot address.
 */
export function useListState<T extends Record<string, string | undefined>>(defaults: Partial<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const cursorStack = useRef<string[]>([])

  // The caller declares the full param shape as T; defaults fill in the subset
  // that has one. Reading a param the caller did not declare is a type error,
  // which is what stops a filter silently never reaching the API.
  const params = useMemo(() => {
    const current = { ...defaults } as Record<string, string | undefined>
    for (const [key, value] of searchParams?.entries() ?? []) {
      if (value !== '') current[key] = value
    }
    return current as T & { cursor?: string }
  }, [searchParams, defaults])

  const write = useCallback(
    (next: Record<string, string | undefined>, { replace = false } = {}) => {
      const search = new URLSearchParams(searchParams?.toString() ?? '')
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === '') search.delete(key)
        else search.set(key, value)
      }
      const qs = search.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  /** Changing a filter invalidates the cursor - page 3 of the old filter is meaningless. */
  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      cursorStack.current = []
      write({ [key]: value, cursor: undefined }, { replace: true })
    },
    [write],
  )

  const setFilters = useCallback(
    (values: Record<string, string | undefined>) => {
      cursorStack.current = []
      write({ ...values, cursor: undefined }, { replace: true })
    },
    [write],
  )

  const setSort = useCallback(
    (sort: string | undefined) => {
      cursorStack.current = []
      write({ sort, cursor: undefined }, { replace: true })
    },
    [write],
  )

  const nextPage = useCallback(
    (nextCursor: string) => {
      if (params.cursor) cursorStack.current.push(params.cursor)
      else cursorStack.current.push('')
      write({ cursor: nextCursor })
    },
    [params.cursor, write],
  )

  const previousPage = useCallback(() => {
    const previous = cursorStack.current.pop()
    write({ cursor: previous || undefined })
  }, [write])

  const reset = useCallback(() => {
    cursorStack.current = []
    router.replace(pathname, { scroll: false })
  }, [pathname, router])

  return {
    params,
    setFilter,
    setFilters,
    setSort,
    nextPage,
    previousPage,
    hasPrevious: cursorStack.current.length > 0,
    reset,
    /** True when any filter beyond paging is active - drives the empty state. */
    isFiltered: Object.entries(params).some(
      ([key, value]) => key !== 'cursor' && key !== 'limit' && key !== 'sort' && Boolean(value),
    ),
  }
}

/** Toggles a sort key between ascending, descending and unset. */
export function nextSort(current: string | undefined, key: string): string | undefined {
  if (current === key) return `-${key}`
  if (current === `-${key}`) return undefined
  return key
}

export function sortDirection(current: string | undefined, key: string): 'asc' | 'desc' | null {
  if (current === key) return 'asc'
  if (current === `-${key}`) return 'desc'
  return null
}
