'use client'

import { Alert, Button, EmptyState, SkeletonTable } from '@triyara/ui'
import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

import { describeApiError } from '@/lib/api-error'

export interface QueryBoundaryProps<T> {
  isPending: boolean
  isError: boolean
  error: unknown
  data: T | undefined
  onRetry?: () => void
  /** Rendered while the first page loads. Match the final shape (§28). */
  skeleton?: ReactNode
  /** Rendered when the query succeeded but there is nothing to show. */
  empty?: ReactNode
  /** Decides emptiness. Defaults to an empty array check. */
  isEmpty?: (data: T) => boolean
  children: (data: T) => ReactNode
}

/**
 * One place that decides between loading, error, empty and content.
 *
 * A failed list and an empty list look identical if you are careless, and they
 * mean opposite things (§20). Keeping the decision here means no screen can
 * accidentally render "No products" when the request actually failed.
 */
export function QueryBoundary<T>({
  isPending,
  isError,
  error,
  data,
  onRetry,
  skeleton,
  empty,
  isEmpty,
  children,
}: QueryBoundaryProps<T>) {
  if (isPending) return <>{skeleton ?? <SkeletonTable />}</>

  if (isError) {
    const described = describeApiError(error)
    return (
      <EmptyState
        variant="error"
        icon={<AlertTriangle />}
        title={described.title}
        description={described.description}
        action={
          onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    )
  }

  if (data === undefined) return null

  const emptyCheck = isEmpty ?? ((value: T) => Array.isArray(value) && value.length === 0)
  if (empty && emptyCheck(data)) return <>{empty}</>

  return <>{children(data)}</>
}

/** Inline error for a panel that must not replace the whole screen. */
export function InlineQueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const described = describeApiError(error)
  return (
    <Alert
      tone="danger"
      title={described.title}
      actions={
        onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {described.description}
      {described.requestId ? (
        <span className="mt-gap block font-mono text-2xs text-content-subtle">
          Reference {described.requestId}
        </span>
      ) : null}
    </Alert>
  )
}
