import type { Metadata } from 'next'

import { QuotationEditScreen } from '@/features/quotations/components/quotation-edit-screen'

export const metadata: Metadata = { title: 'Edit quotation · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <QuotationEditScreen id={id} />
}
