import type { Metadata } from 'next'

import { QuotationConditionsEditor } from '@/features/quotations/components/quotation-conditions-editor'

export const metadata: Metadata = { title: 'Charges and taxes · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <QuotationConditionsEditor id={id} />
}
