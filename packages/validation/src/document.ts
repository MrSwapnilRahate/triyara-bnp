import { z } from 'zod'

// MUST stay in sync with the Prisma enums in @triyara/db.
export const DOCUMENT_TYPES = [
  'GST',
  'IEC',
  'FSSAI',
  'APEDA',
  'ISO',
  'HACCP',
  'BRC',
  'FACTORY_LICENSE',
  'COMPANY_REGISTRATION',
  'IMPORT_EXPORT_LICENSE',
  'PAN',
  'MSME',
  'PRODUCT_CATALOGUE',
  'COMPANY_PROFILE',
  'OTHER',
] as const
export const documentTypeSchema = z.enum(DOCUMENT_TYPES)
export type DocumentType = z.infer<typeof documentTypeSchema>

export const DOCUMENT_STATUSES = ['PENDING', 'RECEIVED', 'VERIFIED', 'EXPIRED', 'REJECTED'] as const
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES)
export type DocumentStatus = z.infer<typeof documentStatusSchema>

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const
export const mimeTypeSchema = z.enum(ALLOWED_MIME_TYPES)

export const presignDocumentSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: mimeTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE),
  accountId: z.string().min(1),
  type: documentTypeSchema,
})
export type PresignDocumentDto = z.infer<typeof presignDocumentSchema>

export const createDocumentSchema = z.object({
  storageKey: z.string().min(1),
  accountId: z.string().min(1),
  supplierProfileId: z.string().min(1).optional(),
  type: documentTypeSchema,
  title: z.string().trim().min(1).max(200),
  mimeType: mimeTypeSchema,
  originalFilename: z.string().trim().min(1).max(200),
  issuedDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
})
export type CreateDocumentDto = z.infer<typeof createDocumentSchema>

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    type: documentTypeSchema.optional(),
    status: documentStatusSchema.optional(),
    supplierProfileId: z.string().min(1).nullable().optional(),
    issuedDate: z.coerce.date().nullable().optional(),
    expiryDate: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>

export const createDocumentVersionSchema = z.object({
  storageKey: z.string().min(1),
  mimeType: mimeTypeSchema,
  originalFilename: z.string().trim().min(1).max(200),
})
export type CreateDocumentVersionDto = z.infer<typeof createDocumentVersionSchema>

export const listDocumentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  sort: z.string().optional(),
  q: z.string().trim().optional(),
  accountId: z.string().optional(),
  type: documentTypeSchema.optional(),
  status: documentStatusSchema.optional(),
  expiringBefore: z.coerce.date().optional(),
  includeDeleted: z.coerce.boolean().optional(),
})
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>
