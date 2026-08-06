'use client'

import { Skeleton } from '@triyara/ui'

import { InlineQueryError } from '@/components/data/query-boundary'

import { useQuotation } from '../api/quotations'
import { QuotationForm } from './quotation-form'

/**
 * Loads the quotation before handing it to the shared form.
 *
 * The form needs the record AND the ETag version that came with it, so the
 * fetch cannot live in the page: a server component has no way to hand a client
 * form the version it must send back as If-Match.
 */
export function QuotationEditScreen({ id }: { id: string }) {
  const query = useQuotation(id)

  if (query.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton className="mt-gap-lg h-64 w-full max-w-4xl" />
      </div>
    )

  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  return <QuotationForm quotation={query.data.quotation} version={query.data.version} />
}
