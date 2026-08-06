'use client'

import { Skeleton } from '@triyara/ui'
import { use } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useProduct } from '@/features/catalog/api/products'
import { ProductForm } from '@/features/catalog/components/product-form'

/**
 * A client page: the form needs both the record and the ETag version, and the
 * version must come from a freshly-validated query. Prefetching this on the
 * server and hydrating a stale version would guarantee a 412 (§17).
 */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const query = useProduct(id)

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

  return <ProductForm product={query.data.product} version={query.data.version} />
}
