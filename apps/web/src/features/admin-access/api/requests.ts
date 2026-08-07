import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type { AdminAccessRequest, AdminAccessRequestStatus } from '../types'

const BASE = '/api/v1/admin-access-requests'

export const accessRequestKeys = {
  all: ['admin-access-requests'] as const,
  list: (query: Record<string, string | undefined>) =>
    [...accessRequestKeys.all, 'list', query] as const,
  mine: () => [...accessRequestKeys.all, 'mine'] as const,
}

export interface AccessRequestQuery {
  [key: string]: string | undefined
  status?: AdminAccessRequestStatus
  q?: string
  sort?: string
  limit?: string
  cursor?: string
}

export function useAccessRequests(query: AccessRequestQuery) {
  return useQuery({
    queryKey: accessRequestKeys.list(query),
    queryFn: async ({ signal }) => {
      const result = await api.get<AdminAccessRequest[]>(`${BASE}${queryString(query)}`, { signal })
      return {
        items: result.data ?? [],
        nextCursor:
          (result.meta?.pagination as { nextCursor?: string | null } | undefined)?.nextCursor ??
          null,
      }
    },
    staleTime: STALE_TIME.list,
  })
}

/** Asks for administrator access. The reason is the whole submission. */
export function useRequestAdminAccess() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (reason: string) => {
      const result = await api.post<AdminAccessRequest>(BASE, { reason })
      return result.data
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: accessRequestKeys.all })
    },
  })
}

/** The caller's own latest request, whatever its state. Drives their UI. */
export function useMyAccessRequest() {
  return useQuery({
    queryKey: accessRequestKeys.mine(),
    queryFn: async ({ signal }) => {
      const result = await api.get<AdminAccessRequest | null>(`${BASE}/mine`, { signal })
      return result.data
    },
    staleTime: STALE_TIME.detail,
  })
}

function useDecision(action: 'approve' | 'reject' | 'revoke') {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      version,
      reason,
    }: {
      id: string
      version: number
      reason?: string
    }) => {
      const result = await api.post<AdminAccessRequest>(
        `${BASE}/${id}/${action}`,
        reason === undefined ? undefined : { reason },
        { version },
      )
      return result.data
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: accessRequestKeys.all })
    },
  })
}

export const useApproveRequest = () => useDecision('approve')
export const useRejectRequest = () => useDecision('reject')
export const useRevokeRequest = () => useDecision('revoke')
