import {
  createCatalogReferenceService,
  createCategoryService,
  createProductService,
} from '@triyara/core'
import { catalogReferenceRepository, categoryRepository, productRepository } from '@triyara/db'

import { eventBus } from './event-bus'

// Product Catalog API wiring (TRY-BNP-CATALOG-S1). Repositories are injected
// here so route handlers depend only on services - never on Prisma.

export const productService = createProductService({ repo: productRepository, events: eventBus })
export const categoryService = createCategoryService({ repo: categoryRepository, events: eventBus })
export const catalogReferenceService = createCatalogReferenceService({
  repo: catalogReferenceRepository,
})
