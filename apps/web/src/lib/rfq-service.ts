import { createRfqService, createRfqSupplierService } from '@triyara/core'
import { rfqRepository, rfqSupplierRepository } from '@triyara/db'

import { eventBus } from './event-bus'

// RFQ REST API wiring (TRY-BNP-RFQ-API). Repositories are injected here so
// route handlers depend only on services - never on Prisma.

export const rfqService = createRfqService({ repo: rfqRepository, events: eventBus })

export const rfqSupplierService = createRfqSupplierService({
  repo: rfqSupplierRepository,
  rfqs: rfqRepository,
  events: eventBus,
})
