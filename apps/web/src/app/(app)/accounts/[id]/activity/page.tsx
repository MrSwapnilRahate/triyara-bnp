import { PageHeader } from '@triyara/ui'
import { listActivitiesQuerySchema } from '@triyara/validation'
import { ChevronLeft } from 'lucide-react'
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
    <>
      {/* This route still sits under the Accounts segment, which keeps its
          dark-theme pin until that module is migrated. Tokens resolve correctly
          under the pin, so this renders properly either way and needs no second
          change when the pin goes. */}
      <PageHeader
        title={account.legalName}
        description="Account timeline"
        breadcrumb={
          <Link
            href="/accounts"
            className="focus-ring inline-flex items-center gap-gap-xs text-xs text-content-muted hover:text-content"
          >
            <ChevronLeft aria-hidden="true" className="size-3.5" />
            Accounts
          </Link>
        }
      />

      <div className="p-gutter">
        <div className="mx-auto max-w-3xl">
          <ActivityFeed
            initialItems={result.items}
            initialCursor={result.nextCursor}
            fetchBase={`/api/v1/accounts/${id}/activities`}
          />
        </div>
      </div>
    </>
  )
}
