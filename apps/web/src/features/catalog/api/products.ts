'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateProductDto, ListProductsQuery, UpdateProductDto } from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type { Product, ProductListItem } from '../types'
import { catalogKeys } from './keys'

/**
 * The ONLY place a catalog product URL appears (TRY-BNP-PORTAL-01 §1, §24).
 * Grep for '/api/catalog' and every hit is in this directory.
 */
const BASE = '/api/catalog/products'

export interface ProductListResult {
  items: ProductListItem[]
  meta: ApiMeta
}

export function useProducts(query: Partial<ListProductsQuery>) {
  return useQuery({
    queryKey: catalogKeys.productList(query),
    queryFn: async ({ signal }): Promise<ProductListResult> => {
      const result = await api.get<ProductListItem[]>(`${BASE}${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

export interface ProductDetail {
  product: Product
  /** From the ETag. Every mutation needs it for If-Match. */
  version: number
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.product(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<ProductDetail> => {
      const result = await api.get<Product>(`${BASE}/${id}`, { signal })
      // Prefer the ETag, but fall back to the record's own version so a missing
      // header cannot silently produce a 428 on the next write.
      return { product: result.data, version: result.version ?? result.data.version }
    },
    // Detail is never served stale: the If-Match version comes from here, and a
    // stale one guarantees a 412 the user cannot explain (§17).
    staleTime: STALE_TIME.detail,
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateProductDto) => {
      const result = await api.post<Product>(BASE, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.products() })
    },
  })
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: UpdateProductDto; version: number }) => {
      const result = await api.patch<Product>(`${BASE}/${id}`, dto, version)
      return { product: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(catalogKeys.product(id), next)
      // Status and name appear in list columns, so the list is stale too.
      void queryClient.invalidateQueries({ queryKey: catalogKeys.products() })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`${BASE}/${id}`, version)
      return id
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: catalogKeys.product(id) })
      void queryClient.invalidateQueries({ queryKey: catalogKeys.products() })
    },
  })
}
