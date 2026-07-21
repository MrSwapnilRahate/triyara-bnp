import { listAccountsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'

import { AccountsView } from './accounts-view'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const auth = await requireAuth()
  const sp = await searchParams
  const query = listAccountsQuerySchema.parse(sp)
  const requestId = crypto.randomUUID()
  const result = await accountService.list({ ...auth, requestId }, query)

  const canWrite = auth.ability.can('create', 'Account')

  return (
    <AccountsView
      accounts={result.items}
      nextCursor={result.nextCursor}
      hasMore={result.hasMore}
      canWrite={canWrite}
    />
  )
}
