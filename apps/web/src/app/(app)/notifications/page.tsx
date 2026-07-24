import { listNotificationsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { notificationPreferenceService } from '@/lib/notification-preference-service'
import { notificationService } from '@/lib/notification-service'

import { NotificationCenter } from './center-view'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const auth = await requireAuth()
  const sp = await searchParams
  const query = listNotificationsQuerySchema.parse({
    limit: 25,
    cursor: sp.cursor,
    q: sp.q,
    type: sp.type,
    filter: sp.filter ?? 'all',
  })

  const [result, prefs] = await Promise.all([
    notificationService.list(auth, query),
    notificationPreferenceService.get(auth),
  ])

  return (
    <NotificationCenter
      initialItems={result.items}
      initialCursor={result.nextCursor}
      preferences={prefs}
    />
  )
}
