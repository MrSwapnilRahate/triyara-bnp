import { createActivityService } from '@triyara/core'
import { activityRepository } from '@triyara/db'

export const activityService = createActivityService({ repo: activityRepository })
