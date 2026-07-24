import { createSupplierService } from '@triyara/core'
import { supplierProfileRepository } from '@triyara/db'

import { eventBus } from './event-bus'

export const supplierService = createSupplierService({
  repo: supplierProfileRepository,
  events: eventBus,
})
