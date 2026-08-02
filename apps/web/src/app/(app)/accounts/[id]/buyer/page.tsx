import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { buyerService } from '@/lib/buyer-service'

import { BuyerProfileView } from './buyer-view'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export default async function BuyerProfilePage({ params }: Params) {
  const auth = await requireAuth()
  const { id } = await params
  const requestId = crypto.randomUUID()

  const account = await accountService.get({ ...auth, requestId }, id, { includeDeleted: true })
  let profile = null
  try {
    profile = await buyerService.get({ ...auth, requestId }, id, { includeDeleted: true })
  } catch {
    profile = null
  }
  const canWrite =
    auth.ability.can('create', 'BuyerProfile') || auth.ability.can('update', 'BuyerProfile')

  return (
    <BuyerProfileView
      accountId={id}
      accountName={account.legalName}
      profile={profile}
      canWrite={canWrite}
      review={{
        id: account.id,
        registrationStatus: account.registrationStatus,
        isSelfRegistered: account.isSelfRegistered,
        version: account.version,
      }}
    />
  )
}
