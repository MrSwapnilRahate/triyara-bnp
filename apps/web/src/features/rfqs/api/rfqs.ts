'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateRfqDto,
  InviteSuppliersDto,
  ListRfqsQuery,
  RfqApprovalDto,
  RfqItemDto,
  SubmitResponseDto,
  SupplierParticipationDto,
  UpdateRfqDto,
} from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type {
  Rfq,
  RfqApproval,
  RfqItem,
  RfqListItem,
  RfqParticipation,
  RfqResponse,
  RfqRevision,
} from '../types'
import { rfqKeys } from './keys'

/** The ONLY place an RFQ URL appears. */
const BASE = '/api/rfqs'

export function useRfqs(query: Partial<ListRfqsQuery>) {
  return useQuery({
    queryKey: rfqKeys.list(query),
    queryFn: async ({ signal }): Promise<{ items: RfqListItem[]; meta: ApiMeta }> => {
      const result = await api.get<RfqListItem[]>(`${BASE}${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

/**
 * Detail is never served stale.
 *
 * Every mutation on this screen sends If-Match with the version from this read.
 * A cached version is a 412 waiting to happen, so staleTime is 0 (§13).
 */
export function useRfq(id: string | undefined) {
  return useQuery({
    queryKey: rfqKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<Rfq>(`${BASE}/${id}`, { signal })
      return { rfq: result.data, version: result.version ?? result.data.version }
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useCreateRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateRfqDto & { items: RfqItemDto[] }) => {
      const result = await api.post<Rfq>(BASE, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfqKeys.all })
    },
  })
}

export function useUpdateRfq(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: UpdateRfqDto; version: number }) => {
      const result = await api.patch<Rfq>(`${BASE}/${id}`, dto, version)
      return { rfq: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(rfqKeys.detail(id), next)
      void queryClient.invalidateQueries({ queryKey: rfqKeys.all })
    },
  })
}

// ---- Line items ----

export function useRfqItems(id: string | undefined) {
  return useQuery({
    queryKey: rfqKeys.items(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<{ items: RfqItem[]; meta: ApiMeta }> => {
      const result = await api.get<RfqItem[]>(`${BASE}/${id}/items`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.detail,
  })
}

/**
 * Replaces every line and cuts a revision. There is no per-line PATCH by
 * design: the RFQ owns its lines, and a partial edit of a document suppliers
 * have already quoted against is not a thing the domain allows.
 */
export function useReviseItems(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, version }: { items: RfqItemDto[]; version: number }) => {
      const result = await api.post<RfqItem[]>(`${BASE}/${id}/items`, { items }, { version })
      return result.data ?? []
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfqKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: rfqKeys.all })
    },
  })
}

// ---- Supplier participation ----

export function useRfqSuppliers(id: string | undefined) {
  return useQuery({
    queryKey: rfqKeys.suppliers(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<{ items: RfqParticipation[]; meta: ApiMeta }> => {
      const result = await api.get<RfqParticipation[]>(`${BASE}/${id}/suppliers`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useInviteSuppliers(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: InviteSuppliersDto) => {
      const result = await api.post<RfqParticipation[]>(`${BASE}/${id}/suppliers`, dto)
      return result.data ?? []
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfqKeys.suppliers(id) })
      void queryClient.invalidateQueries({ queryKey: rfqKeys.detail(id) })
    },
  })
}

export function useSetParticipation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      participationId,
      dto,
      version,
    }: {
      participationId: string
      dto: SupplierParticipationDto
      version: number
    }) => {
      const result = await api.patch<RfqParticipation>(
        `${BASE}/${id}/suppliers/${participationId}`,
        dto,
        version,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfqKeys.suppliers(id) })
      void queryClient.invalidateQueries({ queryKey: rfqKeys.detail(id) })
    },
  })
}

// ---- Bids ----

export function useRfqResponses(
  id: string | undefined,
  query: Record<string, string | undefined> = {},
) {
  return useQuery({
    queryKey: rfqKeys.responses(id ?? '', query),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<{ items: RfqResponse[]; meta: ApiMeta }> => {
      const result = await api.get<RfqResponse[]>(`${BASE}/${id}/responses${queryString(query)}`, {
        signal,
      })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

export function useSubmitResponse(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rfqSupplierId,
      dto,
    }: {
      rfqSupplierId: string
      dto: SubmitResponseDto
    }) => {
      const result = await api.post<{ lines: RfqResponse[] }>(
        `${BASE}/${id}/responses${queryString({ rfqSupplierId })}`,
        dto,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfqKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: rfqKeys.suppliers(id) })
      void queryClient.invalidateQueries({ queryKey: [...rfqKeys.detail(id), 'responses'] })
    },
  })
}

// ---- Workflow ----

/**
 * Publish, close and reopen differ only in their path segment, so they share
 * one hook. Each is a mutation and carries If-Match like any other.
 */
function useWorkflowMove(id: string, move: 'publish' | 'close' | 'reopen') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (version: number) => {
      const result = await api.post<Rfq>(`${BASE}/${id}/${move}`, undefined, { version })
      return { rfq: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(rfqKeys.detail(id), next)
      void queryClient.invalidateQueries({ queryKey: rfqKeys.all })
    },
  })
}

export const usePublishRfq = (id: string) => useWorkflowMove(id, 'publish')
export const useCloseRfq = (id: string) => useWorkflowMove(id, 'close')
export const useReopenRfq = (id: string) => useWorkflowMove(id, 'reopen')

export function useRfqApprovals(id: string | undefined) {
  return useQuery({
    queryKey: rfqKeys.approvals(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<RfqApproval[]> => {
      const result = await api.get<RfqApproval[]>(`${BASE}/${id}/approvals`, { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useDecideRfq(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: RfqApprovalDto; version: number }) => {
      const result = await api.post<Rfq>(`${BASE}/${id}/approvals`, dto, { version })
      return { rfq: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(rfqKeys.detail(id), next)
      void queryClient.invalidateQueries({ queryKey: rfqKeys.approvals(id) })
      void queryClient.invalidateQueries({ queryKey: rfqKeys.all })
    },
  })
}

export function useRfqRevisions(id: string | undefined) {
  return useQuery({
    queryKey: rfqKeys.revisions(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<RfqRevision[]> => {
      const result = await api.get<RfqRevision[]>(`${BASE}/${id}/revisions`, { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.detail,
  })
}
