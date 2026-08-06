'use client'

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Separator,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@triyara/ui'
import { Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { Can } from '@/lib/ability-context'
import { toastApiError } from '@/lib/api-error'

import { useDeleteProduct, useProduct } from '../api/products'

/** Product detail (TRY-BNP-PORTAL-01 §8). Tabs are local here because this wave
 *  ships one screen; they become route segments when media, documents and
 *  pricing arrive, so each is linkable. */
export function ProductDetail({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const query = useProduct(id)
  const remove = useDeleteProduct()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (query.isPending) return <ProductDetailSkeleton />
  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  const { product, version } = query.data

  return (
    <>
      <PageHeader
        title={product.name}
        identifier={product.sku}
        status={<StatusBadge status={product.status} />}
        description={product.shortDescription ?? undefined}
        meta={[
          { label: 'Category', value: product.category?.name ?? '—' },
          { label: 'Brand', value: product.brand ?? '—' },
          { label: 'Origin', value: product.countryOfOrigin ?? '—' },
          {
            label: 'HS code',
            value: product.hsCode ? <span className="font-mono">{product.hsCode}</span> : '—',
          },
          {
            label: 'Active',
            value: product.isActive ? (
              <Badge tone="success" size="sm">
                Yes
              </Badge>
            ) : (
              <Badge size="sm">No</Badge>
            ),
          },
        ]}
        actions={
          // ReferenceData writes are ADMIN-only, so an export manager sees a
          // read-only page rather than buttons that would 403.
          <Can action="update" subject="ReferenceData">
            <Button asChild variant="secondary" leadingIcon={<Pencil />}>
              <Link href={`/catalog/products/${product.id}/edit`}>Edit</Link>
            </Button>
            <Can action="delete" subject="ReferenceData">
              <Button variant="ghost" leadingIcon={<Trash2 />} onClick={() => setConfirmOpen(true)}>
                Delete
              </Button>
            </Can>
          </Can>
        }
        tabs={
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="specifications" count={product.specifications?.length ?? 0}>
                Specifications
              </TabsTrigger>
              <TabsTrigger value="tags" count={product.tags?.length ?? 0}>
                Tags
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="p-gutter">
              <Card className="max-w-3xl">
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  {product.description ? (
                    <p className="whitespace-pre-wrap text-base text-content-muted">
                      {product.description}
                    </p>
                  ) : (
                    <p className="text-base text-content-subtle">No description.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="specifications" className="p-gutter">
              <Card className="max-w-3xl">
                <CardContent className="p-0">
                  {(product.specifications?.length ?? 0) === 0 ? (
                    <EmptyState
                      size="sm"
                      title="No specifications"
                      description="Specifications describe grade, purity and physical attributes."
                    />
                  ) : (
                    <dl>
                      {product.specifications.map((spec, index) => (
                        <div key={spec.id}>
                          {index > 0 ? <Separator /> : null}
                          <div className="flex items-baseline justify-between gap-gap-lg px-gutter py-gap">
                            <dt className="text-base text-content-muted">
                              {spec.definition?.name ?? spec.definitionId}
                            </dt>
                            <dd className="text-base text-content">
                              {formatSpecValue(spec)}
                              {spec.definition?.unit ? (
                                <span className="ml-gap-xs text-content-subtle">
                                  {spec.definition.unit}
                                </span>
                              ) : null}
                            </dd>
                          </div>
                        </div>
                      ))}
                    </dl>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tags" className="p-gutter">
              {(product.tags?.length ?? 0) === 0 ? (
                <EmptyState size="sm" title="No tags" />
              ) : (
                <div className="flex flex-wrap gap-gap">
                  {product.tags.map((t) => (
                    <Badge key={t.tagId} tone="accent">
                      {t.tag.name}
                    </Badge>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${product.name}?`}
        description="The product is retained and its SKU stays reserved, so it can be restored rather than recreated."
        confirmLabel="Delete product"
        tone="danger"
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ id: product.id, version })
            toast.success('Product deleted')
            router.push('/catalog/products')
          } catch (error) {
            // Re-thrown so ConfirmDialog keeps itself open and renders the
            // reason in place rather than closing on a failure.
            toastApiError(toast, error)
            throw error
          }
        }}
      />
    </>
  )
}

function formatSpecValue(spec: {
  valueString: string | null
  valueNumber: string | null
  valueBoolean: boolean | null
  valueDate: string | null
}): string {
  if (spec.valueBoolean !== null) return spec.valueBoolean ? 'Yes' : 'No'
  // Decimals stay strings: parseFloat on a stored decimal is how 18.0000 becomes
  // 18.000000000000004 on screen.
  if (spec.valueNumber !== null) return spec.valueNumber
  if (spec.valueDate !== null) return new Date(spec.valueDate).toLocaleDateString()
  return spec.valueString ?? '—'
}

function ProductDetailSkeleton() {
  return (
    <div>
      <div className="border-b border-line bg-surface px-gutter py-gap-lg">
        <Skeleton variant="text" className="h-6 w-64" />
        <div className="mt-gap-lg flex gap-section">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-gap-xs">
              <Skeleton variant="text" className="w-16" />
              <Skeleton variant="text" className="w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="p-gutter">
        <Skeleton className="h-40 max-w-3xl" />
      </div>
    </div>
  )
}
