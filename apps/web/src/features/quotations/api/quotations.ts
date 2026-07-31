'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateQuotationDto,
  ListQuotationsQuery,
  QuotationApprovalDto,
  QuotationChargeDto,
  QuotationItemDto,
  QuotationTaxDto,
  UpdateQuotationDto,
} from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type {
  Quotation,
  QuotationApproval,
  QuotationCharge,
  QuotationItem,
  QuotationListItem,
  QuotationRevision,
  QuotationTax,
} from '../types'
import { quotationKeys } from './keys'

/** The ONLY place a quotation URL appears. */
const BASE = '/api/quotations'

export function useQuotations(query: Partial<ListQuotationsQuery>) {
  return useQuery({
    queryKey: quotationKeys.list(query),
    queryFn: async ({ signal }): Promise<{ items: QuotationListItem[]; meta: ApiMeta }> => {
      const result = await api.get<QuotationListItem[]>(`${BASE}${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

/**
 * Detail is never served stale: the If-Match version every mutation sends comes
 * from this read, so a cached version is a 412 the user cannot explain (§13).
 */
export function useQuotation(id: string | undefined) {
  return useQuery({
    queryKey: quotationKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<Quotation>(`${BASE}/${id}`, { signal })
      return { quotation: result.data, version: result.version ?? result.data.version }
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useCreateQuotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateQuotationDto & { items: QuotationItemDto[] }) => {
      const result = await api.post<Quotation>(BASE, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
    },
  })
}

export function useUpdateQuotation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: UpdateQuotationDto; version: number }) => {
      const result = await api.patch<Quotation>(`${BASE}/${id}`, dto, version)
      return { quotation: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(quotationKeys.detail(id), next)
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
    },
  })
}

// ---- Lines ----

/**
 * Replaces every line and re-totals. There is no per-line PATCH by design: the
 * service owns the arithmetic, and a partial edit would let the stored totals
 * drift from the lines they are supposed to summarise.
 */
export function useReplaceItems(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, version }: { items: QuotationItemDto[]; version: number }) => {
      const result = await api.post<QuotationItem[]>(`${BASE}/${id}/items`, { items }, { version })
      return { items: result.data ?? [], meta: result.meta }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotationKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
    },
  })
}

// ---- Charges and taxes ----

export function useConditions(id: string | undefined) {
  return useQuery({
    queryKey: quotationKeys.conditions(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({
      signal,
    }): Promise<{ charges: QuotationCharge[]; taxes: QuotationTax[]; meta: ApiMeta }> => {
      const result = await api.get<{ charges: QuotationCharge[]; taxes: QuotationTax[] }>(
        `${BASE}/${id}/conditions`,
        { signal },
      )
      return {
        charges: result.data?.charges ?? [],
        taxes: result.data?.taxes ?? [],
        meta: result.meta,
      }
    },
    staleTime: STALE_TIME.detail,
  })
}

/**
 * Charges and taxes go together in one request because the API sets them
 * together and re-totals once. An empty array clears that side - it is the only
 * way to express "no charges".
 */
export function useSetConditions(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      charges,
      taxes,
      version,
    }: {
      charges: QuotationChargeDto[]
      taxes: QuotationTaxDto[]
      version: number
    }) => {
      const result = await api.put<{ charges: QuotationCharge[]; taxes: QuotationTax[] }>(
        `${BASE}/${id}/conditions`,
        { charges, taxes },
        { version },
      )
      return { data: result.data, meta: result.meta }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotationKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: quotationKeys.conditions(id) })
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
    },
  })
}

// ---- Workflow ----

/**
 * Send, accept and expire differ only in their path segment, so they share one
 * hook. Each is a mutation and carries If-Match like any other.
 */
function useWorkflowMove(id: string, move: 'send' | 'accept' | 'expire') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (version: number) => {
      const result = await api.post<Quotation>(`${BASE}/${id}/${move}`, undefined, { version })
      return { quotation: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(quotationKeys.detail(id), next)
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
    },
  })
}

export const useSendQuotation = (id: string) => useWorkflowMove(id, 'send')
export const useAcceptQuotation = (id: string) => useWorkflowMove(id, 'accept')
export const useExpireQuotation = (id: string) => useWorkflowMove(id, 'expire')

/**
 * Approve and reject have dedicated endpoints that carry optional comments;
 * every other decision - notably PENDING, which submits a draft for review -
 * goes through /approvals.
 */
export function useDecideQuotation(id: string) {
  const queryClient = useQueryClient()
  const invalidate = (next: { quotation: Quotation; version: number }) => {
    queryClient.setQueryData(quotationKeys.detail(id), next)
    void queryClient.invalidateQueries({ queryKey: quotationKeys.approvals(id) })
    void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
  }

  return useMutation({
    mutationFn: async ({ dto, version }: { dto: QuotationApprovalDto; version: number }) => {
      const path =
        dto.decision === 'APPROVED'
          ? `${BASE}/${id}/approve`
          : dto.decision === 'REJECTED'
            ? `${BASE}/${id}/reject`
            : `${BASE}/${id}/approvals`
      const payload =
        dto.decision === 'APPROVED' || dto.decision === 'REJECTED'
          ? { ...(dto.comments === undefined ? {} : { comments: dto.comments }) }
          : dto
      const result = await api.post<Quotation>(path, payload, { version })
      return { quotation: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: invalidate,
  })
}

/**
 * Withdrawing is DELETE, not a transition endpoint: the service implements it as
 * a soft delete that also sets status WITHDRAWN. It therefore needs `delete
 * Account` (ADMIN) and hides the record from default list queries - both of
 * which the UI states plainly rather than papering over.
 */
export function useWithdrawQuotation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (version: number) => {
      const result = await api.delete<Quotation>(`${BASE}/${id}`, version)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotationKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
    },
  })
}

export function useReviseQuotation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      reason,
      items,
      version,
    }: {
      reason: string
      items: QuotationItemDto[]
      version: number
    }) => {
      // 201 with the SUCCESSOR: a different record, under the same number.
      const result = await api.post<Quotation>(
        `${BASE}/${id}/revise`,
        { reason, items },
        { version },
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all })
    },
  })
}

// ---- History ----

export function useApprovals(id: string | undefined) {
  return useQuery({
    queryKey: quotationKeys.approvals(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<QuotationApproval[]> => {
      const result = await api.get<QuotationApproval[]>(`${BASE}/${id}/approvals`, { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useRevisions(id: string | undefined) {
  return useQuery({
    queryKey: quotationKeys.revisions(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<QuotationRevision[]> => {
      const result = await api.get<QuotationRevision[]>(`${BASE}/${id}/revisions`, { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useChain(id: string | undefined) {
  return useQuery({
    queryKey: quotationKeys.chain(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<{ items: QuotationListItem[]; meta: ApiMeta }> => {
      const result = await api.get<QuotationListItem[]>(`${BASE}/${id}/chain`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.detail,
  })
}
