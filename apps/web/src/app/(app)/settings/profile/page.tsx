import type { Metadata } from 'next'

import { Profile } from '@/features/admin/components/profile'

export const metadata: Metadata = { title: 'My profile · Triyara BNP' }

export default function Page() {
  return <Profile />
}
