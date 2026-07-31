import type { Metadata } from 'next'

import { QuotationList } from '@/features/quotations/components/quotation-list'

export const metadata: Metadata = { title: 'Quotations · Triyara BNP' }

export default function Page() {
  return <QuotationList />
}
