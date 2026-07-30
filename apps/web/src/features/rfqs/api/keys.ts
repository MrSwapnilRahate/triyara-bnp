import type { ListRfqsQuery } from '@triyara/validation'

export const rfqKeys = {
  all: ['rfqs'] as const,

  list: (query: Partial<ListRfqsQuery>) => [...rfqKeys.all, 'list', query] as const,
  detail: (id: string) => [...rfqKeys.all, 'detail', id] as const,

  items: (id: string) => [...rfqKeys.all, 'detail', id, 'items'] as const,
  suppliers: (id: string) => [...rfqKeys.all, 'detail', id, 'suppliers'] as const,
  responses: (id: string, query: Record<string, unknown> = {}) =>
    [...rfqKeys.all, 'detail', id, 'responses', query] as const,
  approvals: (id: string) => [...rfqKeys.all, 'detail', id, 'approvals'] as const,
  revisions: (id: string) => [...rfqKeys.all, 'detail', id, 'revisions'] as const,
} as const
