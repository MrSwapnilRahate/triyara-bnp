'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ListQuoteRequestsQuery,
  PromoteQuoteRequestDto,
  ReviewQuoteRequestDto,
} from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type { QuoteRequest } from '../types'
import { quoteRequestKeys } from './keys'

/** The ONLY place a quote request URL appears. */
const BASE = '/api/v1/quote-requests'

export function useQuoteRequests(query: Partial<ListQuoteRequestsQuery>) {
  return useQuery({
    queryKey: quoteRequestKeys.list(query),
    queryFn: async ({ signal }): Promise<{ items: QuoteRequest[]; meta: ApiMeta }> => {
      const result = await api.get<QuoteRequest[]>(`${BASE}${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

/**
 * Detail is never served stale.
 *
 * Both mutations on this screen send If-Match with the version from this read.
 * A cached version is a 412 waiting to happen.
 */
export function useQuoteRequest(id: string | undefined) {
  return useQuery({
    queryKey: quoteRequestKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<QuoteRequest>(`${BASE}/${id}`, { signal })
      return { quoteRequest: result.data, version: result.version ?? result.data.version }
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useReviewQuoteRequest(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: ReviewQuoteRequestDto; version: number }) => {
      const result = await api.patch<QuoteRequest>(`${BASE}/${id}`, dto, version)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quoteRequestKeys.all })
    },
  })
}

/**
 * Promotion. Invalidates the RFQ cache too: this is the one action that creates
 * an RFQ from somewhere other than the RFQ screens, and leaving that list stale
 * would hide the thing the operator just made.
 */
export function usePromoteQuoteRequest(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: PromoteQuoteRequestDto; version: number }) => {
      const result = await api.post<{
        quoteRequest: QuoteRequest
        rfqId: string
        rfqNumber: string
      }>(`${BASE}/${id}/promote`, dto, { version })
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quoteRequestKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['rfqs'] })
    },
  })
}
