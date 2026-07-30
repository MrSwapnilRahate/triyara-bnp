import type { Metadata } from 'next'

import { CategoryTree } from '@/features/catalog/components/category-tree'

export const metadata: Metadata = { title: 'Categories · Triyara BNP' }

export default function Page() {
  return <CategoryTree />
}
