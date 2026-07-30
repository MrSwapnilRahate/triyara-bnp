import { QueryClient } from '@tanstack/react-query'

/**
 * React Query configuration (TRY-BNP-PORTAL-01 §17).
 *
 * Staleness is set per query, not globally, because volatility differs by an
 * order of magnitude across this app. The defaults here are the conservative
 * case; feature hooks raise staleTime for reference data.
 *
 * STALE_TIME.detail is deliberately 0. The If-Match version used by every
 * mutation comes from the cached detail record, so serving a stale one
 * guarantees a 412 the user cannot explain.
 */
export const STALE_TIME = {
  /** Countries, certifications, payment terms, categories, tags. */
  reference: 30 * 60 * 1000,
  /** Lists on a busy multi-user surface. */
  list: 30 * 1000,
  /** Detail records: always revalidate. */
  detail: 0,
} as const

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME.list,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Never retry a deterministic rejection: a 403 or a 422 will not
          // become a 200 on the second attempt, and retrying a 412 would race
          // the conflict dialog.
          const status = (error as { status?: number })?.status
          if (status !== undefined && status >= 400 && status < 500) return false
          return failureCount < 2
        },
      },
      mutations: {
        // A mutation is a user's deliberate act; replaying it automatically
        // risks duplicating a commercial document.
        retry: false,
      },
    },
  })
}
