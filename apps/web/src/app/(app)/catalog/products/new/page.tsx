import type { Metadata } from 'next'

import { ProductForm } from '@/features/catalog/components/product-form'

export const metadata: Metadata = { title: 'New product · Triyara BNP' }

export default function Page() {
  return <ProductForm />
}
