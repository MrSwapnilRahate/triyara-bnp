'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListCategoriesQuery } from '@triyara/validation'

import { api, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type { Category } from '../types'
import { catalogKeys } from './keys'

/**
 * Reference data: categories.
 *
 * Cached for 30 minutes (§17). Categories change rarely and are read by nearly
 * every screen - refetching the list per product page would be pure waste.
 */
export function useCategories(query: Partial<ListCategoriesQuery> = {}) {
  return useQuery({
    queryKey: catalogKeys.categoryList(query),
    queryFn: async ({ signal }) => {
      // The tree needs every category, not a page of them; 100 is the API cap.
      const result = await api.get<Category[]>(
        `/api/catalog/categories${queryString({ limit: 100, ...query })}`,
        { signal },
      )
      return { items: result.data ?? [], nextCursor: result.meta.pagination?.nextCursor ?? null }
    },
    staleTime: STALE_TIME.reference,
  })
}

/**
 * Undoes a soft delete. `update Category` - ADMIN only, matching the rest of
 * the catalogue's write boundary.
 */
export function useRestoreCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const result = await api.post<Category>(`/api/catalog/categories/${id}/restore`, undefined, {
        version,
      })
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.categories() })
    },
  })
}
