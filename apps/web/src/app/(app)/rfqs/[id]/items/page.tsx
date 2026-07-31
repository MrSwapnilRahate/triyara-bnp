import type { Metadata } from 'next'

import { RfqItemsEditor } from '@/features/rfqs/components/rfq-items-editor'

export const metadata: Metadata = { title: 'Revise lines · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RfqItemsEditor id={id} />
}
