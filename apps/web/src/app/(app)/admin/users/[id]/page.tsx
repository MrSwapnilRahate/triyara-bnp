import type { Metadata } from 'next'

import { UserDetail } from '@/features/admin/components/user-detail'

export const metadata: Metadata = { title: 'User · Triyara BNP' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <UserDetail id={id} />
}
