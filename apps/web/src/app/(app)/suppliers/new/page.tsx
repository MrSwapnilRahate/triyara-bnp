import type { Metadata } from 'next'

import { SupplierForm } from '@/features/suppliers/components/supplier-form'

export const metadata: Metadata = { title: 'New supplier · Triyara BNP' }

export default function Page() {
  return <SupplierForm />
}
