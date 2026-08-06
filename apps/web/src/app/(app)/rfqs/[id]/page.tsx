import type { Metadata } from 'next'

import { RfqDetail } from '@/features/rfqs/components/rfq-detail'

export const metadata: Metadata = { title: 'RFQ · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RfqDetail id={id} />
}
