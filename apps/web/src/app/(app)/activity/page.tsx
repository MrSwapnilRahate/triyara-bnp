import { PageHeader } from '@triyara/ui'
import { listActivitiesQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ActivityFeed } from '@/components/activity-feed'
import { activityService } from '@/lib/activity-service'

export const dynamic = 'force-dynamic'

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const auth = await requireAuth()
  const sp = await searchParams
  const query = listActivitiesQuerySchema.parse({
    limit: 25,
    cursor: sp.cursor,
    q: sp.q,
    entityType: sp.entityType,
    activityType: sp.activityType,
  })
  const result = await activityService.list(auth, query)

  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything that has happened across accounts, suppliers, documents and verifications."
      />

      <div className="p-gutter">
        <div className="mx-auto max-w-3xl">
          <ActivityFeed
            initialItems={result.items}
            initialCursor={result.nextCursor}
            fetchBase="/api/v1/activities"
          />
        </div>
      </div>
    </>
  )
}
