'use client'

import { Button, EmptyState } from '@triyara/ui'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Route-level boundary (TRY-BNP-PORTAL-01 §20). A failure here replaces this
 * screen only - the shell, navigation and every other route stay usable.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="p-gutter">
      <EmptyState
        variant="error"
        icon={<AlertTriangle />}
        title="This RFQ screen could not load"
        description={error.message}
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
      {error.digest ? (
        <p className="mt-gap text-center font-mono text-2xs text-content-subtle">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  )
}
