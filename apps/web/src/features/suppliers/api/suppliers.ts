'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateSupplierDto,
  ListSuppliersQuery,
  SupplierCertificationDto,
  SupplierContactDto,
  SupplierDocumentDto,
  SupplierNoteDto,
  SupplierOfferingDto,
  UpdateSupplierCertificationDto,
  UpdateSupplierContactDto,
  UpdateSupplierDocumentDto,
  UpdateSupplierDto,
  UpdateSupplierNoteDto,
} from '@triyara/validation'

import { api, type ApiMeta, queryString } from '@/lib/api-client'
import { STALE_TIME } from '@/lib/query-client'

import type {
  CertificationFacet,
  CountryFacet,
  Supplier,
  SupplierCertificationRow,
  SupplierContact,
  SupplierDocumentRow,
  SupplierListItem,
  SupplierNote,
  SupplierOffering,
  SupplierSearchHit,
} from '../types'
import { supplierKeys } from './keys'

/** The ONLY place a supplier URL appears. */
const BASE = '/api/suppliers'

export function useSuppliers(query: Partial<ListSuppliersQuery>) {
  return useQuery({
    queryKey: supplierKeys.list(query),
    queryFn: async ({ signal }): Promise<{ items: SupplierListItem[]; meta: ApiMeta }> => {
      const result = await api.get<SupplierListItem[]>(`${BASE}${queryString(query)}`, { signal })
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: supplierKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const result = await api.get<Supplier>(`${BASE}/${id}`, { signal })
      return { supplier: result.data, version: result.version ?? result.data.version }
    },
    staleTime: STALE_TIME.detail,
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateSupplierDto) => {
      const result = await api.post<Supplier>(BASE, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ dto, version }: { dto: UpdateSupplierDto; version: number }) => {
      const result = await api.patch<Supplier>(`${BASE}/${id}`, dto, version)
      return { supplier: result.data, version: result.version ?? result.data.version }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(supplierKeys.detail(id), next)
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`${BASE}/${id}`, version)
      return id
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: supplierKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

/**
 * Typeahead search. Enabled only from two characters, matching the API's own
 * minimum - firing a request the server will reject with 422 is pure noise.
 */
export function useSupplierSearch(query: string, options: { limit?: number } = {}) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: supplierKeys.search(`${trimmed}:${options.limit ?? 10}`),
    enabled: trimmed.length >= 2,
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierSearchHit[]>(
        `${BASE}/search${queryString({ q: trimmed, limit: options.limit ?? 10 })}`,
        { signal },
      )
      return result.data ?? []
    },
    staleTime: STALE_TIME.list,
  })
}

/**
 * Filter vocabularies. These drive the country and certification filters: the
 * API reports what this tenant actually holds, with counts, rather than 249 ISO
 * codes of which most would be empty.
 */
export function useSupplierCountries() {
  return useQuery({
    queryKey: supplierKeys.countries(),
    queryFn: async ({ signal }) => {
      const result = await api.get<CountryFacet[]>(`${BASE}/countries`, { signal })
      return result.data ?? []
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useSupplierCertifications() {
  return useQuery({
    queryKey: supplierKeys.certifications(),
    queryFn: async ({ signal }) => {
      const result = await api.get<CertificationFacet[]>(`${BASE}/certifications`, { signal })
      return { facets: result.data ?? [], vocabulary: (result.meta.vocabulary ?? []) as string[] }
    },
    staleTime: STALE_TIME.reference,
  })
}

export function useSupplierOfferings(
  supplierId: string | undefined,
  query: Record<string, string | undefined> = {},
) {
  return useQuery({
    queryKey: supplierKeys.offerings(supplierId ?? '', query),
    enabled: Boolean(supplierId),
    queryFn: async ({ signal }): Promise<{ items: SupplierOffering[]; meta: ApiMeta }> => {
      const result = await api.get<SupplierOffering[]>(
        `${BASE}/${supplierId}/products${queryString(query)}`,
        { signal },
      )
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

export function useAddSupplierOffering(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: SupplierOfferingDto) => {
      const result = await api.post<SupplierOffering>(`${BASE}/${supplierId}/products`, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...supplierKeys.all, 'detail', supplierId, 'offerings'],
      })
    },
  })
}

// ---- Contacts (TRY-BNP-SUPPLIER-CONTACT) ----

/**
 * The people at a supplier. Kept in its own cache entry rather than read off
 * the supplier detail, so adding a contact refreshes the list without refetching
 * the whole record - and so the tab still works while the detail is stale.
 */
export function useSupplierContacts(supplierId: string | undefined) {
  return useQuery({
    queryKey: supplierKeys.contacts(supplierId ?? ''),
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierContact[]>(`${BASE}/${supplierId}/contacts`, { signal })
      return result.data
    },
    enabled: Boolean(supplierId),
    staleTime: STALE_TIME.detail,
  })
}

export function useAddSupplierContact(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: SupplierContactDto) => {
      const result = await api.post<SupplierContact>(`${BASE}/${supplierId}/contacts`, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.contacts(supplierId) })
      // The detail response embeds contacts too; without this the header and
      // the tab would disagree until the next navigation.
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    },
  })
}

export function useUpdateSupplierContact(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dto,
      version,
    }: {
      id: string
      dto: UpdateSupplierContactDto
      version: number
    }) => {
      const result = await api.patch<SupplierContact>(
        `${BASE}/${supplierId}/contacts/${id}`,
        dto,
        version,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.contacts(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    },
  })
}

export function useDeleteSupplierContact(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`${BASE}/${supplierId}/contacts/${id}`, version)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.contacts(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    },
  })
}

// ---- Certifications (TRY-BNP-SUPPLIER-CERT) ----

/**
 * What a supplier holds. Its own cache entry rather than read off the supplier
 * detail, so recording a certificate refreshes the list without refetching the
 * whole record.
 */
export function useSupplierCertificationList(supplierId: string | undefined) {
  return useQuery({
    queryKey: supplierKeys.certificationsFor(supplierId ?? ''),
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierCertificationRow[]>(
        `${BASE}/${supplierId}/certifications`,
        { signal },
      )
      return result.data
    },
    enabled: Boolean(supplierId),
    staleTime: STALE_TIME.detail,
  })
}

export function useAddSupplierCertification(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: SupplierCertificationDto) => {
      const result = await api.post<SupplierCertificationRow>(
        `${BASE}/${supplierId}/certifications`,
        dto,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.certificationsFor(supplierId) })
      // The detail response embeds certifications too, and the tenant-wide
      // facet list feeds the supplier filter - both go stale on a new record.
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.certifications() })
    },
  })
}

export function useUpdateSupplierCertification(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dto,
      version,
    }: {
      id: string
      dto: UpdateSupplierCertificationDto
      version: number
    }) => {
      const result = await api.patch<SupplierCertificationRow>(
        `${BASE}/${supplierId}/certifications/${id}`,
        dto,
        version,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.certificationsFor(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.certifications() })
    },
  })
}

export function useDeleteSupplierCertification(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`${BASE}/${supplierId}/certifications/${id}`, version)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.certificationsFor(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.certifications() })
    },
  })
}

// ---- Documents (TRY-BNP-SUPPLIER-DOC) ----

export function useSupplierDocuments(supplierId: string | undefined) {
  return useQuery({
    queryKey: supplierKeys.documents(supplierId ?? ''),
    queryFn: async ({ signal }) => {
      const result = await api.get<SupplierDocumentRow[]>(`${BASE}/${supplierId}/documents`, {
        signal,
      })
      return result.data
    },
    enabled: Boolean(supplierId),
    staleTime: STALE_TIME.detail,
  })
}

interface Presigned {
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  storageKey: string
  expiresAt: string
}

/**
 * The two-step upload, as one call site.
 *
 * Presign, PUT the bytes straight at storage, then record the row. Kept
 * together because a caller who did step one and forgot step two would leave
 * an orphaned object nobody can find.
 */
export function useUploadSupplierDocument(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      meta,
    }: {
      file: File
      meta: Omit<SupplierDocumentDto, 'storageKey' | 'mimeType'>
    }) => {
      const presigned = await api.post<Presigned>(`${BASE}/${supplierId}/documents/presign`, {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })

      const put = await fetch(presigned.data.uploadUrl, {
        method: 'PUT',
        headers: presigned.data.headers,
        body: file,
      })
      if (!put.ok) throw new Error('The file could not be uploaded. Try again.')

      const result = await api.post<SupplierDocumentRow>(`${BASE}/${supplierId}/documents`, {
        ...meta,
        storageKey: presigned.data.storageKey,
        mimeType: file.type,
      })
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.documents(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    },
  })
}

/** Swaps the file behind an existing record, keeping its identity. */
export function useReplaceSupplierDocument(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file, version }: { id: string; file: File; version: number }) => {
      const presigned = await api.post<Presigned>(`${BASE}/${supplierId}/documents/presign`, {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      const put = await fetch(presigned.data.uploadUrl, {
        method: 'PUT',
        headers: presigned.data.headers,
        body: file,
      })
      if (!put.ok) throw new Error('The file could not be uploaded. Try again.')

      const result = await api.patch<SupplierDocumentRow>(
        `${BASE}/${supplierId}/documents/${id}`,
        { storageKey: presigned.data.storageKey, mimeType: file.type },
        version,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.documents(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    },
  })
}

export function useUpdateSupplierDocument(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dto,
      version,
    }: {
      id: string
      dto: UpdateSupplierDocumentDto
      version: number
    }) => {
      const result = await api.patch<SupplierDocumentRow>(
        `${BASE}/${supplierId}/documents/${id}`,
        dto,
        version,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.documents(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    },
  })
}

export function useDeleteSupplierDocument(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`${BASE}/${supplierId}/documents/${id}`, version)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.documents(supplierId) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    },
  })
}

// ---- Notes (the CRM timeline) ----

export function useSupplierNotes(
  supplierId: string | undefined,
  query: Record<string, string | undefined> = {},
) {
  return useQuery({
    queryKey: supplierKeys.notes(supplierId ?? '', query),
    enabled: Boolean(supplierId),
    queryFn: async ({ signal }): Promise<{ items: SupplierNote[]; meta: ApiMeta }> => {
      const result = await api.get<SupplierNote[]>(
        `${BASE}/${supplierId}/notes${queryString(query)}`,
        { signal },
      )
      return { items: result.data ?? [], meta: result.meta }
    },
    staleTime: STALE_TIME.list,
    placeholderData: (previous) => previous,
  })
}

export function useAddSupplierNote(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dto: SupplierNoteDto) => {
      const result = await api.post<SupplierNote>(`${BASE}/${supplierId}/notes`, dto)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.notesFor(supplierId) })
    },
  })
}

export function useUpdateSupplierNote(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dto,
      version,
    }: {
      id: string
      dto: UpdateSupplierNoteDto
      version: number
    }) => {
      const result = await api.patch<SupplierNote>(
        `${BASE}/${supplierId}/notes/${id}`,
        dto,
        version,
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.notesFor(supplierId) })
    },
  })
}

export function useDeleteSupplierNote(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await api.delete(`${BASE}/${supplierId}/notes/${id}`, version)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.notesFor(supplierId) })
    },
  })
}
