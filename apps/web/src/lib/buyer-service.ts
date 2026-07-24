import { createBuyerService } from '@triyara/core'
import { buyerProfileRepository } from '@triyara/db'

import { eventBus } from './event-bus'

export const buyerService = createBuyerService({ repo: buyerProfileRepository, events: eventBus })
