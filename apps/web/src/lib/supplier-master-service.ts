import {
  createSupplierCertificationService,
  createSupplierContactService,
  createSupplierDocumentService,
  createSupplierMasterService,
  createSupplierNoteService,
  createSupplierOfferingService,
} from '@triyara/core'
import {
  supplierCertificationRepository,
  supplierContactRepository,
  supplierDocumentRepository,
  supplierNoteRepository,
  supplierOfferingRepository,
  supplierRepository,
} from '@triyara/db'
import { createStorageFromEnv } from '@triyara/storage'
import { MAX_FILE_SIZE } from '@triyara/validation'

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

export const supplierContactService = createSupplierContactService({
  repo: supplierContactRepository,
  events: eventBus,
})

export const supplierCertificationService = createSupplierCertificationService({
  repo: supplierCertificationRepository,
  events: eventBus,
})

export const supplierDocumentService = createSupplierDocumentService({
  repo: supplierDocumentRepository,
  storage: createStorageFromEnv(),
  events: eventBus,
  maxBytes: MAX_FILE_SIZE,
})

export const supplierNoteService = createSupplierNoteService({
  repo: supplierNoteRepository,
  events: eventBus,
})
