import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { supplierService } from '@/lib/supplier-service'

import { SupplierProfileView } from './supplier-view'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export default async function SupplierProfilePage({ params }: Params) {
  const auth = await requireAuth()
  const { id } = await params
  const requestId = crypto.randomUUID()

  const account = await accountService.get({ ...auth, requestId }, id, { includeDeleted: true })

  let profile = null
  try {
    profile = await supplierService.get({ ...auth, requestId }, id, { includeDeleted: true })
  } catch {
    profile = null
  }

  const canWrite =
    auth.ability.can('create', 'SupplierProfile') || auth.ability.can('update', 'SupplierProfile')

  return (
    <SupplierProfileView
      accountId={id}
      accountName={account.legalName}
      profile={profile}
      canWrite={canWrite}
    />
  )
}
