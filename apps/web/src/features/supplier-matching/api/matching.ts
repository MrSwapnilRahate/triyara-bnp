'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import { supplierKeys } from '../../suppliers/api/keys'
import type {
  OpenRfq,
  ShortlistSupplier,
  SupplierQuotationHistoryItem,
  SupplierRfqHistoryItem,
  SupplierScore,
} from '../types'

// Hooks over the matching endpoints. Every one is a READ except the invite:
// this screen finds suppliers, it does not edit them.

const BASE = '/api/suppliers'

/**
 * The shortlist: suppliers matching the filters, with a score each.
 *
 * Scores arrive in `meta` rather than on the items, so they are zipped here —
 * once, at the boundary — and every component below sees one shape.
 */
export function useShortlist(filters: Record<string, string>) {
  return useQuery({
    queryKey: supplierKeys.shortlist(filters),
    queryFn: async ({ signal }) => {
      const result = await api.get<ShortlistSupplier[]>(
        `${BASE}/shortlist${queryString(filters)}`,
        { signal },
      )
      const meta = result.meta as ApiMeta & { scores?: SupplierScore[] }
      const scores = new Map((meta.scores ?? []).map((s) => [s.supplierId, s]))

      return {
        items: (result.data ?? []).map((supplier) => ({
          supplier,
          score: scores.get(supplier.id) ?? null,
        })),
        meta,
      }
    },
    staleTime: STALE_TIME.list,
    // Keeps the previous page on screen while a filter change is in flight, so
    // the list does not blink to empty on every keystroke.
    placeholderData: (previous) => previous,
  })
}

export function useSupplierScore(supplierId: string | undefined) {
  return useQuery({
    queryKey: supplierKeys.score(supplierId ?? ''),
    enabled: Boolean(supplierId),
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierScore | null>(`${BASE}/${supplierId}/score`, { signal })
      return result.data
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useSupplierRfqHistory(supplierId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: supplierKeys.rfqHistory(supplierId ?? ''),
    enabled: Boolean(supplierId) && enabled,
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierRfqHistoryItem[]>(`${BASE}/${supplierId}/rfqs`, {
        signal,
      })
      return result.data ?? []
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useSupplierQuotationHistory(supplierId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: supplierKeys.quotationHistory(supplierId ?? ''),
    enabled: Boolean(supplierId) && enabled,
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierQuotationHistoryItem[]>(
        `${BASE}/${supplierId}/quotations`,
        { signal },
      )
      return result.data ?? []
    },
    staleTime: STALE_TIME.detail,
  })
}

/**
 * RFQs a supplier can still be added to.
 *
 * `openOnly` rather than a status list, so the screen does not have to know
 * which states count as open — the API owns that, and it cannot drift here.
 */
export function useOpenRfqs(enabled = false) {
  return useQuery({
    queryKey: ['rfqs', 'open'],
    enabled,
    queryFn: async ({ signal }) => {
      const result = await api.get<OpenRfq[]>('/api/rfqs?openOnly=true&limit=50', { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.list,
  })
}

/** Adds a supplier to an RFQ, through the RFQ module's own endpoint. */
export function useInviteToRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ rfqId, supplierId }: { rfqId: string; supplierId: string }) => {
      await api.post(`/api/rfqs/${rfqId}/suppliers`, { supplierIds: [supplierId] })
      return { rfqId, supplierId }
    },
    onSuccess: ({ supplierId }) => {
      // The invitation changes this supplier's RFQ history and its
      // responsiveness signal, so both go stale.
      void queryClient.invalidateQueries({ queryKey: supplierKeys.rfqHistory(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.score(supplierId) })
      void queryClient.invalidateQueries({ queryKey: [...supplierKeys.all, 'shortlist'] })
    },
  })
}
