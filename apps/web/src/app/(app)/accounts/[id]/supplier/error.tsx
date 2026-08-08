'use client'

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
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-red-400">Could not load the supplier profile</h2>
      <button
        onClick={reset}
        className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:text-white"
      >
        Retry
      </button>
    </div>
  )
}
