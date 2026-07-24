import { catalogReferenceRepository } from '@triyara/db'
import { listProductsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { categoryService, productService } from '@/lib/product-service'

import { ProductsView } from './products-view'

export const dynamic = 'force-dynamic'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const auth = await requireAuth()
  const orgId = auth.organizationId
  const sp = await searchParams
  const query = listProductsQuerySchema.parse({
    limit: 25,
    cursor: sp.cursor,
    q: sp.q,
    categoryId: sp.categoryId,
    status: sp.status,
  })

  const [result, categories, units, packaging, origins, hsCodes, attributes] = await Promise.all([
    productService.list(auth, query),
    categoryService.list(auth),
    catalogReferenceRepository.listUnits(orgId),
    catalogReferenceRepository.listPackagingTypes(orgId),
    catalogReferenceRepository.listOriginCountries(orgId),
    catalogReferenceRepository.listHsCodes(orgId),
    catalogReferenceRepository.listAttributes(orgId),
  ])

  const canWrite = auth.ability.can('create', 'ReferenceData')

  return (
    <ProductsView
      items={result.items}
      nextCursor={result.nextCursor}
      canWrite={canWrite}
      ref={{
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        units,
        packaging,
        origins,
        hsCodes,
        attributes,
      }}
    />
  )
}
