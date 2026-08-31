'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AccountRecord } from '@triyara/db'
import type {
  BulkAccountDto,
  CreateAccountDto,
  ListAccountsQuery,
  UpdateAccountDto,
} from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import { accountKeys } from './keys'

/**
 * The accounts screen, on the same footing as suppliers.
 *
 * It used to be a server component handing rows to a client view, with each
 * mutation a Server Action calling `revalidatePath('/accounts')`. That put the
 * re-rendered route inside the action's own response, and applying it is a
 * router transition - the same one `router.refresh()` uses, and the one that
 * intermittently never settles. Measured on the create dialog: 2 failures in 10
 * runs before this change, and removing `revalidatePath` alone did not help,
 * because the list still needed a refresh to arrive.
 *
 * Fetching the list here instead settles it over `fetch`, which has none of
 * that. Nothing about the list moves to the client: `GET /api/v1/accounts`
 * parses the same `listAccountsQuerySchema` and calls the same
 * `accountService.list` the page did, so search, country, status, owner, date
 * range, includeDeleted, ordering and the cursor all stay exactly where they
 * were - on the server. A mutation invalidates and the server answers again.
 *
 * The ONLY place an accounts URL appears.
 */
const BASE = '/api/v1/accounts'

export function useAccounts(query: Partial<ListAccountsQuery>) {
  return useQuery({
    queryKey: accountKeys.list(query),
    queryFn: async ({ signal }): Promise<{ items: AccountRecord[]; meta: ApiMeta }> => {
      const result = await api.get<AccountRecord[]>(`${BASE}${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    // Keeps the previous page on screen while the next one loads, so paging and
    // filtering do not blank the table.
    placeholderData: (previous) => previous,
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateAccountDto) => {
      const result = await api.post<AccountRecord>(BASE, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dto,
      version,
    }: {
      id: string
      dto: UpdateAccountDto
      version: number
    }) => {
      const result = await api.patch<AccountRecord>(`${BASE}/${id}`, dto, version)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const result = await api.delete<AccountRecord>(`${BASE}/${id}`, version)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

export function useRestoreAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const result = await api.post<AccountRecord>(`${BASE}/${id}/restore`, undefined, { version })
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

/**
 * Sets a status across a selection.
 *
 * Answers with a per-id summary rather than records - some rows may be refused
 * while others succeed - so there is nothing here to merge into the table, and
 * the invalidation is what makes the result visible. A bulk write can also move
 * rows out of the active filter, which is another reason the server re-answers.
 */
export function useBulkAccountStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: BulkAccountDto) => {
      const result = await api.post<{ summary: { failed: number } }>(`${BASE}/bulk`, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}
