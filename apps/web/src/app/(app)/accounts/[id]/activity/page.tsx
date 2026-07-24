import { listActivitiesQuerySchema } from '@triyara/validation'
import Link from 'next/link'

import { requireAuth } from '@/auth/context'
import { ActivityFeed } from '@/components/activity-feed'
import { accountService } from '@/lib/account-service'
import { activityService } from '@/lib/activity-service'

export const dynamic = 'force-dynamic'

export default async function AccountActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const auth = await requireAuth()
  const { id } = await params
  const sp = await searchParams
  const requestId = crypto.randomUUID()

  const query = listActivitiesQuerySchema.parse({
    limit: 25,
    cursor: sp.cursor,
    q: sp.q,
    entityType: sp.entityType,
    activityType: sp.activityType,
  })
  const [account, result] = await Promise.all([
    accountService.get({ ...auth, requestId }, id, { includeDeleted: true }),
    activityService.listForAccount(auth, id, query),
  ])

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/accounts" className="hover:text-gold text-xs text-white/40">
        &larr; Accounts
      </Link>
      <h1 className="text-gold mb-1 mt-2 text-2xl font-bold">{account.legalName}</h1>
      <p className="mb-6 text-sm text-white/40">Account timeline</p>
      <ActivityFeed
        initialItems={result.items}
        initialCursor={result.nextCursor}
        fetchBase={`/api/v1/accounts/${id}/activities`}
      />
    </div>
  )
}
