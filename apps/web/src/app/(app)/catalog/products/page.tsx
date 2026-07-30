import type { Metadata } from 'next'

import { ProductList } from '@/features/catalog/components/product-list'

export const metadata: Metadata = { title: 'Products · Triyara BNP' }

export default function Page() {
  return <ProductList />
}
