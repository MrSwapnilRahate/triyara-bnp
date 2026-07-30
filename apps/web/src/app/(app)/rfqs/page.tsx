import type { Metadata } from 'next'

import { RfqList } from '@/features/rfqs/components/rfq-list'

export const metadata: Metadata = { title: 'RFQs · Triyara BNP' }

export default function Page() {
  return <RfqList />
}
