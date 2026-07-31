import type { Metadata } from 'next'

import { OrganizationSettings } from '@/features/admin/components/organization-settings'

export const metadata: Metadata = { title: 'Organization · Triyara BNP' }

export default function Page() {
  return <OrganizationSettings />
}
