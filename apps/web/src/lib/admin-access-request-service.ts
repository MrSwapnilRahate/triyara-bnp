import { createAdminAccessRequestService } from '@triyara/core'
import { adminAccessRequestRepository } from '@triyara/db'

import { eventBus } from './event-bus'

// Admin access request wiring (TRY-BNP-SUPERADMIN-01). The repository is
// injected here so route handlers depend only on the service.

export const adminAccessRequestService = createAdminAccessRequestService({
  repo: adminAccessRequestRepository,
  events: eventBus,
})
