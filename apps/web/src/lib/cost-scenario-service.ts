import { createCostScenarioService } from '@triyara/core'
import {
  costScenarioRepository,
  freightRateRepository,
  logisticsReferenceRepository,
} from '@triyara/db'

import { eventBus } from './event-bus'

// Cost scenario REST wiring (V3, ADR-0012). The repository is injected here so
// route handlers depend only on the service - never on Prisma.

export const costScenarioService = createCostScenarioService({
  repo: costScenarioRepository,
  events: eventBus,
  // V3.4: freight lookup and LOCODE resolution. Injected here for the same
  // reason as the repository - the route depends only on the service.
  freightRates: freightRateRepository,
  logistics: logisticsReferenceRepository,
})
