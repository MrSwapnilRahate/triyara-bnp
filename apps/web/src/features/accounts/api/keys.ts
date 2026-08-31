import type { ListAccountsQuery } from '@triyara/validation'

export const accountKeys = {
  all: ['accounts'] as const,

  list: (query: Partial<ListAccountsQuery>) => [...accountKeys.all, 'list', query] as const,
  detail: (id: string) => [...accountKeys.all, 'detail', id] as const,
} as const
