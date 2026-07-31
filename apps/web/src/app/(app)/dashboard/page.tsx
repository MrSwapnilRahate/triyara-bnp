import type { Metadata } from 'next'

import { AdminDashboard } from '@/features/admin/components/dashboard'

export const metadata: Metadata = { title: 'Dashboard · Triyara BNP' }

export default function Page() {
  return <AdminDashboard />
}
