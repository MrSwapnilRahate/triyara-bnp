import type { Metadata } from 'next'

import { SupplierList } from '@/features/suppliers/components/supplier-list'

export const metadata: Metadata = { title: 'Suppliers · Triyara BNP' }

export default function Page() {
  return <SupplierList />
}
