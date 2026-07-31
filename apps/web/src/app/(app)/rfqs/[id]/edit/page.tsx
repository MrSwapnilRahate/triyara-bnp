import type { Metadata } from 'next'

import { RfqEditScreen } from '@/features/rfqs/components/rfq-edit-screen'

export const metadata: Metadata = { title: 'Edit RFQ · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RfqEditScreen id={id} />
}
