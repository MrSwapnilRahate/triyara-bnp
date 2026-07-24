import { updatePreferencesSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseBody, route } from '@/lib/api'
import { notificationPreferenceService } from '@/lib/notification-preference-service'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const prefs = await notificationPreferenceService.get(auth)
    return ok(prefs, { requestId })
  })
}

export function PATCH(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const dto = await parseBody(req, updatePreferencesSchema)
    const prefs = await notificationPreferenceService.update(auth, dto)
    return ok(prefs, { requestId })
  })
}
