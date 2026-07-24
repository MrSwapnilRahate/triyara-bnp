import { requireAuth } from '@/auth/context'
import { categoryService } from '@/lib/product-service'

import { CategoryManager } from './category-manager'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const auth = await requireAuth()
  const categories = await categoryService.list(auth)
  const canWrite = auth.ability.can('create', 'ReferenceData')
  return (
    <CategoryManager
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        parentId: c.parentId,
        version: c.version,
      }))}
      canWrite={canWrite}
    />
  )
}
