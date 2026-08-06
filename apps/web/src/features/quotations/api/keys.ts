import type { ListQuotationsQuery } from '@triyara/validation'

export const quotationKeys = {
  all: ['quotations'] as const,

  list: (query: Partial<ListQuotationsQuery>) => [...quotationKeys.all, 'list', query] as const,
  detail: (id: string) => [...quotationKeys.all, 'detail', id] as const,

  conditions: (id: string) => [...quotationKeys.all, 'detail', id, 'conditions'] as const,
  approvals: (id: string) => [...quotationKeys.all, 'detail', id, 'approvals'] as const,
  revisions: (id: string) => [...quotationKeys.all, 'detail', id, 'revisions'] as const,
  chain: (id: string) => [...quotationKeys.all, 'detail', id, 'chain'] as const,
} as const
