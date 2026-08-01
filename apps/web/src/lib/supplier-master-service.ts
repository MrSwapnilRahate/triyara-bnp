import {
  createSupplierCertificationService,
  createSupplierMasterService,
  createSupplierOfferingService,
} from '@triyara/core'
import {
  supplierCertificationRepository,
  supplierOfferingRepository,
  supplierRepository,
} from '@triyara/db'

import { eventBus } from './event-bus'

// Supplier REST API wiring (TRY-BNP-SUPPLIER-API). Repositories are injected
// here so route handlers depend only on services - never on Prisma.
//
// Distinct from `supplier-service.ts`, which wires the FROZEN SupplierProfile
// module. That file is untouched: SupplierProfile is a 1:1 extension of Account,
// while this is the supplier MASTER record used for sourcing. Two different
// aggregates that happen to share a word.

export const supplierMasterService = createSupplierMasterService({
  repo: supplierRepository,
  events: eventBus,
})

export const supplierOfferingService = createSupplierOfferingService({
  repo: supplierOfferingRepository,
  events: eventBus,
})

export const supplierCertificationService = createSupplierCertificationService({
  repo: supplierCertificationRepository,
  events: eventBus,
})
