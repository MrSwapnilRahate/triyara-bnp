import { createSupplierService } from '@triyara/core'
import { supplierProfileRepository } from '@triyara/db'
import { createLoggingEventBus } from '@triyara/events'
import { logger } from '@triyara/lib'

export const supplierService = createSupplierService({
  repo: supplierProfileRepository,
  events: createLoggingEventBus(logger),
})
