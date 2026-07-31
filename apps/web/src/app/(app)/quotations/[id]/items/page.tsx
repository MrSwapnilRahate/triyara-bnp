import type { Metadata } from 'next'

import { QuotationLinesEditor } from '@/features/quotations/components/quotation-lines-editor'

export const metadata: Metadata = { title: 'Edit lines · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <QuotationLinesEditor id={id} mode="replace" />
}
