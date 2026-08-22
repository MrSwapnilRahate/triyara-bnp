import { createCostScenarioService } from '@triyara/core'
import { costScenarioRepository } from '@triyara/db'

import { eventBus } from './event-bus'

// Cost scenario REST wiring (V3, ADR-0012). The repository is injected here so
// route handlers depend only on the service - never on Prisma.

export const costScenarioService = createCostScenarioService({
  repo: costScenarioRepository,
  events: eventBus,
})
