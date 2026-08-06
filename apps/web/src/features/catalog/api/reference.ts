'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateCategoryDto, ListCategoriesQuery, UpdateCategoryDto } from '@triyara/validation'

import { api, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type { Category, SpecificationDefinition, Tag } from '../types'
import { catalogKeys } from './keys'

/**
 * Reference data: categories, specification definitions, tags.
 *
 * All three are cached for 30 minutes (§17). They change rarely and are read by
 * nearly every screen - refetching a category list per product page would be
 * pure waste.
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

export function useSpecificationDefinitions() {
  return useQuery({
    queryKey: catalogKeys.specifications(),
    queryFn: async ({ signal }) => {
      const result = await api.get<SpecificationDefinition[]>(
        '/api/catalog/specifications?limit=100',
        { signal },
      )
      return result.data ?? []
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useTags() {
  return useQuery({
    queryKey: catalogKeys.tags(),
    queryFn: async ({ signal }) => {
      const result = await api.get<Tag[]>('/api/catalog/tags?limit=100', { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateCategoryDto) => {
      const result = await api.post<Category>('/api/catalog/categories', dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.categories() })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dto,
      version,
    }: {
      id: string
      dto: UpdateCategoryDto
      version: number
    }) => {
      const result = await api.patch<Category>(`/api/catalog/categories/${id}`, dto, version)
      return result.data
    },
    onSuccess: () => {
      // Re-parenting recomputes path and depth for a whole subtree, so the
      // entire tree is invalidated rather than one node patched in place.
      void queryClient.invalidateQueries({ queryKey: catalogKeys.categories() })
      void queryClient.invalidateQueries({ queryKey: catalogKeys.products() })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`/api/catalog/categories/${id}`, version)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.categories() })
    },
  })
}
