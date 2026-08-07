'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type {
  AdminUser,
  BaseRole,
  LoginAttempt,
  PermissionMatrix,
  RoleName,
  ScopedRoleAssignment,
  UserSession,
} from '../types'
import { adminKeys } from './keys'

const BASE = '/api/v1'

// User administration (TRY-BNP-PORTAL-01 §12).
//
// Every hook here reads an endpoint that already exists. Nothing is computed
// client-side that the server could have said: the roles a person holds, what a
// role may do, and whether a session is live all come from the API, because a
// second opinion about authorization is a bug waiting to be found in
// production.

// ---- Users list ----

export interface AdminUsersQuery {
  // Index signature so the shape satisfies queryString and useListState.
  [key: string]: string | undefined
  limit?: string
  cursor?: string
  q?: string
  status?: string
  role?: string
  sort?: string
}

export function useAdminUsers(query: AdminUsersQuery) {
  return useQuery({
    queryKey: adminKeys.users(query),
    queryFn: async ({ signal }) => {
      const result = await api.get<AdminUser[]>(`${BASE}/admin/users${queryString(query)}`, {
        signal,
      })
      return { items: result.data, meta: result.meta as ApiMeta }
    },
    staleTime: STALE_TIME.list,
    // Keeps the previous page on screen while the next one loads, so paging
    // does not blank the table.
    placeholderData: (previous) => previous,
  })
}

/**
 * One user, taken from the list endpoint.
 *
 * There is no `GET /admin/users/:id`, and this does not invent one - it asks
 * the list for that row. A dedicated detail endpoint would be the better shape
 * if the detail screen ever needs a field the list does not carry.
 */
export function useAdminUser(id: string) {
  return useQuery({
    queryKey: adminKeys.user(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<AdminUser[]>(
        `${BASE}/admin/users${queryString({ limit: 100 })}`,
        {
          signal,
        },
      )
      return result.data.find((u) => u.id === id) ?? null
    },
    staleTime: STALE_TIME.detail,
  })
}

// ---- Base roles ----

export function useUserRoles(id: string) {
  return useQuery({
    queryKey: adminKeys.userRoles(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<BaseRole[]>(`${BASE}/admin/users/${id}/roles`, { signal })
      return result.data
    },
    staleTime: STALE_TIME.detail,
  })
}

export interface InviteUserInput {
  name: string
  email: string
  role: RoleName
}

export interface InvitedUser {
  id: string
  name: string
  email: string
  role: RoleName
  expiresAt: string
}

/**
 * Invites a colleague.
 *
 * The response carries no token: the invitation reaches the invitee by email
 * and nowhere else, so an administrator never holds something that would let
 * them set another person's password.
 */
export function useInviteUser() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: InviteUserInput) => {
      const result = await api.post<InvitedUser>(`${BASE}/admin/users`, input)
      return {
        user: result.data,
        invitationEmail: result.meta?.invitationEmail as string | undefined,
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...adminKeys.all, 'users'] })
    },
  })
}

export function useAssignRole(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (role: RoleName) => {
      const result = await api.post<BaseRole[]>(`${BASE}/admin/users/${id}/roles`, { role })
      return result.data
    },
    onSuccess: () => {
      // The user's own subtree, plus every list page - a role change moves a
      // row in and out of a role filter.
      void client.invalidateQueries({ queryKey: adminKeys.user(id) })
      void client.invalidateQueries({ queryKey: [...adminKeys.all, 'users'] })
    },
  })
}

export function useRevokeRole(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (role: RoleName) => {
      // No version: a membership is a set element, and this endpoint sends no
      // If-Match. The server refuses the two dangerous revocations itself.
      const result = await api.delete<BaseRole[]>(`${BASE}/admin/users/${id}/roles/${role}`)
      return result.data
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.user(id) })
      void client.invalidateQueries({ queryKey: [...adminKeys.all, 'users'] })
    },
  })
}

// ---- Scoped roles ----

export function useUserScopedRoles(id: string) {
  return useQuery({
    queryKey: adminKeys.userScopedRoles(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<ScopedRoleAssignment[]>(
        `${BASE}/auth/role-assignments${queryString({ userId: id, limit: 100 })}`,
        { signal },
      )
      return result.data
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useRevokeScopedRole(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (assignment: { id: string; version: number }) => {
      // This one IS a versioned record, so it carries its If-Match.
      await api.delete(`${BASE}/auth/role-assignments/${assignment.id}`, assignment.version)
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: adminKeys.userScopedRoles(userId) }),
  })
}

// ---- Sessions ----

export function useUserSessions(id: string, activeOnly: boolean) {
  return useQuery({
    queryKey: adminKeys.userSessions(id, activeOnly),
    queryFn: async ({ signal }) => {
      const result = await api.get<UserSession[]>(
        `${BASE}/auth/sessions${queryString({ userId: id, activeOnly: activeOnly ? 'true' : undefined, limit: 100 })}`,
        { signal },
      )
      return result.data
    },
    staleTime: STALE_TIME.list,
  })
}

export function useRevokeSession(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      // The endpoint takes a reason and defaults it; sending it explicitly
      // keeps the audit trail readable rather than relying on a default.
      await api.delete(`${BASE}/auth/sessions/${sessionId}`, undefined, {
        body: { reason: 'REVOKED_BY_ADMIN' },
      })
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: adminKeys.user(userId) }),
  })
}

// ---- Login activity ----

export interface LoginActivityQuery {
  [key: string]: string | undefined
  outcome?: string
  from?: string
  to?: string
  limit?: string
  cursor?: string
}

export function useLoginAttempts(id: string, query: LoginActivityQuery) {
  return useQuery({
    queryKey: adminKeys.userLoginAttempts(id, query),
    queryFn: async ({ signal }) => {
      const result = await api.get<LoginAttempt[]>(
        `${BASE}/auth/login-attempts${queryString({ userId: id, ...query })}`,
        { signal },
      )
      return { items: result.data, meta: result.meta as ApiMeta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

// ---- Permission matrix ----

/**
 * The authorization vocabulary, rendered verbatim.
 *
 * Cached as reference data because it only changes when the application is
 * redeployed - it is derived from `buildAbilityFor`, which is compiled in.
 */
export function usePermissionMatrix() {
  return useQuery({
    queryKey: adminKeys.permissionMatrix(),
    queryFn: async ({ signal }) => {
      const result = await api.get<PermissionMatrix>(`${BASE}/auth/permission-matrix`, { signal })
      return result.data
    },
    staleTime: STALE_TIME.reference,
  })
}
