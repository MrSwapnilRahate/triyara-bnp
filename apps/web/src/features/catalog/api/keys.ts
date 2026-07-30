import type { ListCategoriesQuery, ListProductsQuery } from '@triyara/validation'

/**
 * Query keys (TRY-BNP-PORTAL-01 §17).
 *
 * Hierarchical so invalidation can be surgical or broad: invalidating
 * `catalogKeys.products()` clears every product list and detail, while
 * `catalogKeys.product(id)` clears exactly one.
 */
export const catalogKeys = {
  all: ['catalog'] as const,

  products: () => [...catalogKeys.all, 'products'] as const,
  productList: (query: Partial<ListProductsQuery>) =>
    [...catalogKeys.products(), 'list', query] as const,
  product: (id: string) => [...catalogKeys.products(), 'detail', id] as const,

  categories: () => [...catalogKeys.all, 'categories'] as const,
  categoryList: (query: Partial<ListCategoriesQuery>) =>
    [...catalogKeys.categories(), 'list', query] as const,
  category: (id: string) => [...catalogKeys.categories(), 'detail', id] as const,

  specifications: () => [...catalogKeys.all, 'specifications'] as const,
  tags: () => [...catalogKeys.all, 'tags'] as const,
} as const
