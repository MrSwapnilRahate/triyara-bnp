'use client'

import { Button, EmptyState } from '@triyara/ui'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

import { reportClientError } from '@/lib/report-client-error'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => reportClientError(error), [error])

  return (
    <div className="p-gutter">
      <EmptyState
        variant="error"
        icon={<AlertTriangle />}
        title="Could not load the supplier profile"
        action={
          <Button variant="secondary" onClick={reset}>
            Retry
          </Button>
        }
      />
    </div>
  )
}
