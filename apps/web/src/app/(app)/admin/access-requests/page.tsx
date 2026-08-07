import type { Metadata } from 'next'

import { AccessRequestList } from '@/features/admin-access/components/access-request-list'

export const metadata: Metadata = { title: 'Admin access requests · Triyara BNP' }

export default function Page() {
  return <AccessRequestList />
}
