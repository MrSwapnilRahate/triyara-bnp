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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-gold mb-6 text-2xl font-bold">Activity</h1>
      <ActivityFeed
        initialItems={result.items}
        initialCursor={result.nextCursor}
        fetchBase="/api/v1/activities"
      />
    </div>
  )
}
