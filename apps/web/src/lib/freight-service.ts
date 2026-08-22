import { createFreightRateService, createLogisticsReferenceService } from '@triyara/core'
import { freightRateRepository, logisticsReferenceRepository } from '@triyara/db'

import { eventBus } from './event-bus'

// Freight and logistics REST wiring (V3.3). Repositories are injected here so
// route handlers depend only on services - never on Prisma.

export const logisticsReferenceService = createLogisticsReferenceService({
  repo: logisticsReferenceRepository,
})

export const freightRateService = createFreightRateService({
  repo: freightRateRepository,
  reference: logisticsReferenceRepository,
  events: eventBus,
})
