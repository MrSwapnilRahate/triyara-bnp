import type { Metadata } from 'next'

import { NotificationPreferences } from '@/features/admin/components/notification-preferences'

export const metadata: Metadata = { title: 'Notifications · Triyara BNP' }

export default function Page() {
  return <NotificationPreferences />
}
