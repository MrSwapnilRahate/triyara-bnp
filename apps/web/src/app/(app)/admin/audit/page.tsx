import type { Metadata } from 'next'

import { AuditLog } from '@/features/admin/components/audit-log'

export const metadata: Metadata = { title: 'Audit log · Triyara BNP' }

export default function Page() {
  return <AuditLog />
}
