import type { Metadata } from 'next'

import { RfqForm } from '@/features/rfqs/components/rfq-form'

export const metadata: Metadata = { title: 'New RFQ · Triyara BNP' }

export default function Page() {
  return <RfqForm />
}
