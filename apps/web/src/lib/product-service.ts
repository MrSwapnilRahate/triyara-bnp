import { createCategoryService, createProductService } from '@triyara/core'
import {
  catalogReferenceRepository,
  productCategoryRepository,
  productRepository,
} from '@triyara/db'

import { eventBus } from './event-bus'

export const productService = createProductService({
  repo: productRepository,
  categories: productCategoryRepository,
  reference: catalogReferenceRepository,
  events: eventBus,
})

export const categoryService = createCategoryService({
  repo: productCategoryRepository,
  events: eventBus,
})
