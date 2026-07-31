import type { Metadata } from 'next'

import { QuotationForm } from '@/features/quotations/components/quotation-form'

export const metadata: Metadata = { title: 'New quotation · Triyara BNP' }

export default function Page() {
  return <QuotationForm />
}
