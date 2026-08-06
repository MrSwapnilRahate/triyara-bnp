import type { ListSuppliersQuery } from '@triyara/validation'

export const supplierKeys = {
  all: ['suppliers'] as const,

  list: (query: Partial<ListSuppliersQuery>) => [...supplierKeys.all, 'list', query] as const,
  detail: (id: string) => [...supplierKeys.all, 'detail', id] as const,
  documents: (id: string) => [...supplierKeys.all, 'detail', id, 'documents'] as const,
  certificationsFor: (id: string) => [...supplierKeys.all, 'detail', id, 'certifications'] as const,
  contacts: (id: string) => [...supplierKeys.all, 'detail', id, 'contacts'] as const,
  offerings: (id: string, query: Record<string, unknown> = {}) =>
    [...supplierKeys.all, 'detail', id, 'offerings', query] as const,
  /** Prefix, so any filtered page of a supplier's notes invalidates together. */
  notesFor: (id: string) => [...supplierKeys.all, 'detail', id, 'notes'] as const,
  notes: (id: string, query: Record<string, unknown> = {}) =>
    [...supplierKeys.notesFor(id), query] as const,

  // Matching (TRY-BNP-SUPPLIER-MATCH). Under the same root so a supplier
  // mutation anywhere invalidates the shortlist too.
  shortlist: (query: Record<string, unknown> = {}) =>
    [...supplierKeys.all, 'shortlist', query] as const,
  score: (id: string) => [...supplierKeys.all, 'detail', id, 'score'] as const,
  rfqHistory: (id: string) => [...supplierKeys.all, 'detail', id, 'rfqs'] as const,
  quotationHistory: (id: string) => [...supplierKeys.all, 'detail', id, 'quotations'] as const,

  search: (query: string) => [...supplierKeys.all, 'search', query] as const,
  countries: () => [...supplierKeys.all, 'countries'] as const,
  certifications: () => [...supplierKeys.all, 'certifications'] as const,
} as const
