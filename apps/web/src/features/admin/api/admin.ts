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
  EmailVerificationStatus,
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

/**
 * Uploads a new profile photo for the signed-in user.
 *
 * Three steps, and they are the same three every other upload on this platform
 * makes: ask the server for a target, PUT the bytes straight at storage, then
 * tell the server it landed. Nothing here names a user - the server derives the
 * object key from the session, so there is no id to get wrong or to tamper with.
 *
 * The profile is invalidated rather than patched from the response. The photo
 * is served from a URL that does not change between uploads, so what has to be
 * refreshed is the browser's copy of the IMAGE, and re-reading the profile is
 * what makes every Avatar on the page re-request it.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const presigned = await api.post<{
        uploadUrl: string
        method: string
        headers: Record<string, string>
      }>(`${BASE}/me/avatar/presign`, {
        mimeType: file.type,
        sizeBytes: file.size,
      })

      const uploaded = await fetch(presigned.data.uploadUrl, {
        method: 'PUT',
        headers: presigned.data.headers,
        body: file,
        // The local provider's upload target is same-origin and expects the
        // session cookie; a presigned S3 URL ignores it.
        credentials: 'include',
      })
      if (!uploaded.ok) throw new Error('The image could not be uploaded to storage.')

      const confirmed = await api.put<{ avatarUrl: string }>(`${BASE}/me/avatar`, {})
      return confirmed.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.profile() })
    },
  })
}

/** Removes the photo and the stored object. */
export function useRemoveAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const result = await api.delete<{ avatarUrl: null }>(`${BASE}/me/avatar`)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.profile() })
    },
  })
}

/**
 * Own verification standing.
 *
 * `/me` does not carry it - verification lives on the security profile, a
 * separate record - so this is its own read. Never served from cache: the
 * address is verified by opening a link, which happens in another tab or on a
 * phone, so a stale answer here is the normal case rather than the exception.
 */
export function useEmailVerificationStatus() {
  return useQuery({
    queryKey: adminKeys.emailVerification(),
    queryFn: async ({ signal }) => {
      const result = await api.get<EmailVerificationStatus>(`${BASE}/auth/email-verification`, {
        signal,
      })
      return result.data
    },
    staleTime: STALE_TIME.detail,
  })
}

/**
 * Sends yourself a verification link.
 *
 * Takes no argument, deliberately. The route reads `?userId=` so an
 * administrator can issue one for somebody else, and the service demands
 * `update User` to do it - a target this hook must never be able to supply,
 * because the screen it serves is "my profile". Verifying your own address is
 * not an administrative act and must not acquire the shape of one.
 *
 * The response carries the address and the expiry; the token is in the email
 * and nowhere else.
 */
export function useRequestEmailVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const result = await api.post<{ email: string; expiresAt: string; sent: boolean }>(
        `${BASE}/auth/email-verification`,
        {},
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.emailVerification() })
    },
  })
}

/**
 * Consumes the token from the emailed link. Identity comes from the token, so
 * nothing else is sent.
 *
 * Both the standing and the profile are invalidated: the badge on the profile
 * screen reads the former, and a session that verified in this tab should not
 * find a stale "not verified" waiting on the other one.
 */
export function useConfirmEmailVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const result = await api.post<EmailVerificationStatus>(
        `${BASE}/auth/email-verification/confirm`,
        { token },
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.emailVerification() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.profile() })
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
