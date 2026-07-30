'use client'

import { Skeleton } from '@triyara/ui'
import { use } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useSupplier } from '@/features/suppliers/api/suppliers'
import { SupplierForm } from '@/features/suppliers/components/supplier-form'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const query = useSupplier(id)

  if (query.isPending)
    return (
      <div className="p-gutter">
        <Skeleton className="mx-auto h-96 max-w-3xl" />
      </div>
    )
  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  return <SupplierForm supplier={query.data.supplier} version={query.data.version} />
}
