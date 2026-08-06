'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ChangePasswordDto,
  UpdateOrganizationDto,
  UpdateProfileDto,
} from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type {
  AuditEntry,
  DashboardSummary,
  DashboardTrends,
  DirectoryUser,
  Organization,
  Profile,
} from '../types'
import { adminKeys } from './keys'

const BASE = '/api/v1'

// ---- Dashboard ----

export function useDashboardSummary() {
  return useQuery({
    queryKey: adminKeys.summary(),
    queryFn: async ({ signal }) => {
      const result = await api.get<DashboardSummary>(`${BASE}/dashboard/summary`, { signal })
      return result.data
    },
    // Counts move as records move; a busy desk should not see a minute-old KPI.
    staleTime: STALE_TIME.list,
  })
}

export function useDashboardTrends(window: '3m' | '6m' | '12m' = '6m') {
  return useQuery({
    queryKey: adminKeys.trends(window),
    queryFn: async ({ signal }) => {
      const result = await api.get<DashboardTrends>(
        `${BASE}/dashboard/trends${queryString({ window })}`,
        { signal },
      )
      return result.data
    },
    // Monthly buckets barely move within a session, and the grouped scan is the
    // most expensive read on this screen - so it is cached far longer than the
    // counts beside it.
    staleTime: STALE_TIME.reference,
    placeholderData: (previous) => previous,
  })
}

// ---- Audit ----

export interface AuditQuery {
  // Index signature so the shape satisfies queryString and useListState, which
  // both take an open record.
  [key: string]: string | number | undefined
  limit?: number
  cursor?: string
  q?: string
  entityType?: string
  actorId?: string
  action?: string
  after?: string
  before?: string
}

export function useAuditLog(query: AuditQuery) {
  return useQuery({
    queryKey: adminKeys.audit(query),
    queryFn: async ({ signal }): Promise<{ items: AuditEntry[]; meta: ApiMeta }> => {
      const result = await api.get<AuditEntry[]>(`${BASE}/audit${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

// ---- Organization ----

export function useOrganization() {
  return useQuery({
    queryKey: adminKeys.organization(),
    queryFn: async ({ signal }) => {
      const result = await api.get<Organization>(`${BASE}/organization`, { signal })
      return result.data
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: UpdateOrganizationDto) => {
      const result = await api.patch<Organization>(`${BASE}/organization`, dto)
      return result.data
    },
    // The endpoint carries no version, so there is no If-Match to send and no
    // 412 to handle: renaming a tenant is not a concurrent-edit hazard the way
    // a priced document is. Writing the response straight into the cache keeps
    // the shell's organization badge correct without a refetch.
    onSuccess: (organization) => {
      queryClient.setQueryData(adminKeys.organization(), organization)
    },
  })
}

// ---- Profile ----

export function useProfile() {
  return useQuery({
    queryKey: adminKeys.profile(),
    queryFn: async ({ signal }) => {
      const result = await api.get<Profile>(`${BASE}/me`, { signal })
      return result.data
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: UpdateProfileDto) => {
      const result = await api.patch<Profile>(`${BASE}/me`, dto)
      return result.data
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(adminKeys.profile(), profile)
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (dto: ChangePasswordDto) => {
      // Returns no body by design; there is nothing to cache or read back.
      await api.post(`${BASE}/me/password`, dto)
    },
  })
}

// ---- Notification preferences ----

export interface NotificationPreference {
  id?: string
  type: string
  enabled: boolean
  muted: boolean
  digest: boolean
  channels: string[]
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: adminKeys.notificationPreferences(),
    queryFn: async ({ signal }) => {
      const result = await api.get<NotificationPreference[]>(`${BASE}/notification-preferences`, {
        signal,
      })
      return result.data ?? []
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (preferences: NotificationPreference[]) => {
      const result = await api.patch<NotificationPreference[]>(`${BASE}/notification-preferences`, {
        preferences,
      })
      return result.data ?? []
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.notificationPreferences() })
    },
  })
}

// ---- Directory, for global search ----

export function useDirectory(query: string, enabled: boolean) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: adminKeys.directory(trimmed),
    enabled: enabled && trimmed.length >= 2,
    queryFn: async ({ signal }) => {
      const result = await api.get<DirectoryUser[]>(
        `${BASE}/users${queryString({ q: trimmed, limit: 5 })}`,
        { signal },
      )
      return result.data ?? []
    },
    staleTime: STALE_TIME.list,
  })
}
