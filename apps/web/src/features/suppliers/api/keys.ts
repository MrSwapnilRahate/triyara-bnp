import type { ListSuppliersQuery } from '@triyara/validation'

export const supplierKeys = {
  all: ['suppliers'] as const,

  list: (query: Partial<ListSuppliersQuery>) => [...supplierKeys.all, 'list', query] as const,
  detail: (id: string) => [...supplierKeys.all, 'detail', id] as const,
  offerings: (id: string, query: Record<string, unknown> = {}) =>
    [...supplierKeys.all, 'detail', id, 'offerings', query] as const,
  /** Prefix, so any filtered page of a supplier's notes invalidates together. */
  notesFor: (id: string) => [...supplierKeys.all, 'detail', id, 'notes'] as const,
  notes: (id: string, query: Record<string, unknown> = {}) =>
    [...supplierKeys.notesFor(id), query] as const,

  search: (query: string) => [...supplierKeys.all, 'search', query] as const,
  countries: () => [...supplierKeys.all, 'countries'] as const,
  certifications: () => [...supplierKeys.all, 'certifications'] as const,
} as const
