'use client'

import { Skeleton } from '@triyara/ui'

import { InlineQueryError } from '@/components/data/query-boundary'

import { useRfq } from '../api/rfqs'
import { RfqForm } from './rfq-form'

/**
 * Loads the RFQ before handing it to the shared form.
 *
 * The form needs both the record and the ETag version that came with it, so
 * the fetch cannot live in the page component - a server component has no way
 * to hand a client form the version it must send back as If-Match.
 */
export function RfqEditScreen({ id }: { id: string }) {
  const query = useRfq(id)

  if (query.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton className="mt-gap-lg h-64 w-full max-w-3xl" />
      </div>
    )

  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  return <RfqForm rfq={query.data.rfq} version={query.data.version} />
}
