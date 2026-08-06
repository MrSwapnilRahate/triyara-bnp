import type { Metadata } from 'next'

import { UserList } from '@/features/admin/components/user-list'

export const metadata: Metadata = { title: 'Users · Triyara BNP' }

export default function Page() {
  return <UserList />
}
