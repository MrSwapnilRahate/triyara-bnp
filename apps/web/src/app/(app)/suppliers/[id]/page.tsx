import type { Metadata } from 'next'

import { SupplierDetail } from '@/features/suppliers/components/supplier-detail'

export const metadata: Metadata = { title: 'Supplier · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SupplierDetail id={id} />
}
