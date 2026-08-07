import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type { AdminAccessCounts, AdminAccessRequest, AdminAccessRequestStatus } from '../types'

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
  from?: string
  to?: string
  sort?: string
  limit?: string
  cursor?: string
}

const EMPTY_COUNTS: AdminAccessCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  revoked: 0,
  total: 0,
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
        counts: (result.meta?.counts as AdminAccessCounts | undefined) ?? EMPTY_COUNTS,
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

/**
 * The caller's own latest request, whatever its state. Drives their UI.
 *
 * `enabled` because hooks cannot be called conditionally: someone who already
 * holds ADMIN has nothing to ask for, and firing this on every one of their
 * profile views would be a request whose answer is never read.
 */
export function useMyAccessRequest(enabled = true) {
  return useQuery({
    queryKey: accessRequestKeys.mine(),
    enabled,
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
