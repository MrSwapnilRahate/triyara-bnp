import { listVerificationsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { verificationService } from '@/lib/verification-service'

import { VerificationQueue } from './queue-view'

export const dynamic = 'force-dynamic'

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const auth = await requireAuth()
  const requestId = crypto.randomUUID()
  const sp = await searchParams
  const query = listVerificationsQuerySchema.parse({
    limit: 25,
    cursor: sp.cursor,
    status: sp.status,
    accountId: sp.accountId,
  })

  const [result, accounts] = await Promise.all([
    verificationService.list({ ...auth, requestId }, query),
    accountService.list({ ...auth, requestId }, { limit: 100 }),
  ])

  return (
    <VerificationQueue
      items={result.items}
      nextCursor={result.nextCursor}
      accounts={accounts.items.map((a) => ({ id: a.id, legalName: a.legalName }))}
      accountNames={Object.fromEntries(accounts.items.map((a) => [a.id, a.legalName]))}
      canCreate={auth.ability.can('create', 'Verification')}
    />
  )
}
