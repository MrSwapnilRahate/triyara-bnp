import type { ListQuoteRequestsQuery } from '@triyara/validation'

export const quoteRequestKeys = {
  all: ['quote-requests'] as const,

  list: (query: Partial<ListQuoteRequestsQuery>) =>
    [...quoteRequestKeys.all, 'list', query] as const,
  detail: (id: string) => [...quoteRequestKeys.all, 'detail', id] as const,
} as const
