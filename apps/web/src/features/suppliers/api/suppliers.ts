'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateSupplierDto,
  ListSuppliersQuery,
  SupplierOfferingDto,
  UpdateSupplierDto,
} from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type {
  CertificationFacet,
  CountryFacet,
  Supplier,
  SupplierListItem,
  SupplierOffering,
  SupplierSearchHit,
} from '../types'
import { supplierKeys } from './keys'

/** The ONLY place a supplier URL appears. */
const BASE = '/api/suppliers'

export function useSuppliers(query: Partial<ListSuppliersQuery>) {
  return useQuery({
    queryKey: supplierKeys.list(query),
    queryFn: async ({ signal }): Promise<{ items: SupplierListItem[]; meta: ApiMeta }> => {
      const result = await api.get<SupplierListItem[]>(`${BASE}${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: supplierKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<Supplier>(`${BASE}/${id}`, { signal })
      return { supplier: result.data, version: result.version ?? result.data.version }
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateSupplierDto) => {
      const result = await api.post<Supplier>(BASE, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: UpdateSupplierDto; version: number }) => {
      const result = await api.patch<Supplier>(`${BASE}/${id}`, dto, version)
      return { supplier: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(supplierKeys.detail(id), next)
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`${BASE}/${id}`, version)
      return id
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: supplierKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

/**
 * Typeahead search. Enabled only from two characters, matching the API's own
 * minimum - firing a request the server will reject with 422 is pure noise.
 */
export function useSupplierSearch(query: string, options: { limit?: number } = {}) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: supplierKeys.search(`${trimmed}:${options.limit ?? 10}`),
    enabled: trimmed.length >= 2,
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierSearchHit[]>(
        `${BASE}/search${queryString({ q: trimmed, limit: options.limit ?? 10 })}`,
        { signal },
      )
      return result.data ?? []
    },
    staleTime: STALE_TIME.list,
  })
}

/**
 * Filter vocabularies. These drive the country and certification filters: the
 * API reports what this tenant actually holds, with counts, rather than 249 ISO
 * codes of which most would be empty.
 */
export function useSupplierCountries() {
  return useQuery({
    queryKey: supplierKeys.countries(),
    queryFn: async ({ signal }) => {
      const result = await api.get<CountryFacet[]>(`${BASE}/countries`, { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useSupplierCertifications() {
  return useQuery({
    queryKey: supplierKeys.certifications(),
    queryFn: async ({ signal }) => {
      const result = await api.get<CertificationFacet[]>(`${BASE}/certifications`, { signal })
      return { facets: result.data ?? [], vocabulary: (result.meta.vocabulary ?? []) as string[] }
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useSupplierOfferings(
  supplierId: string | undefined,
  query: Record<string, string | undefined> = {},
) {
  return useQuery({
    queryKey: supplierKeys.offerings(supplierId ?? '', query),
    enabled: Boolean(supplierId),
    queryFn: async ({ signal }): Promise<{ items: SupplierOffering[]; meta: ApiMeta }> => {
      const result = await api.get<SupplierOffering[]>(
        `${BASE}/${supplierId}/products${queryString(query)}`,
        { signal },
      )
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

export function useAddSupplierOffering(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: SupplierOfferingDto) => {
      const result = await api.post<SupplierOffering>(`${BASE}/${supplierId}/products`, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...supplierKeys.all, 'detail', supplierId, 'offerings'],
      })
    },
  })
}
