import type { Metadata } from 'next'

import { QuotationDetail } from '@/features/quotations/components/quotation-detail'

export const metadata: Metadata = { title: 'Quotation · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <QuotationDetail id={id} />
}
