import { z } from 'zod'

import { documentTypeSchema } from './document'

// MUST stay in sync with the Prisma enums in @triyara/db.
export const VERIFICATION_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'DOCUMENTS_REQUESTED',
  'IN_REVIEW',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED',
] as const
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES)
export type VerificationStatus = z.infer<typeof verificationStatusSchema>

export const VERIFICATION_ITEM_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const
export const verificationItemStatusSchema = z.enum(VERIFICATION_ITEM_STATUSES)

const requiredTypes = z.array(documentTypeSchema).max(30)

export const createVerificationSchema = z.object({
  accountId: z.string().min(1),
  supplierProfileId: z.string().min(1).optional(),
  requiredDocumentTypes: requiredTypes.optional(),
})
export type CreateVerificationDto = z.infer<typeof createVerificationSchema>

export const updateVerificationSchema = z
  .object({ requiredDocumentTypes: requiredTypes })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
export type UpdateVerificationDto = z.infer<typeof updateVerificationSchema>

export const requestDocumentsSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  requestedTypes: requiredTypes.optional(),
})
export type RequestDocumentsDto = z.infer<typeof requestDocumentsSchema>

export const assignReviewerSchema = z.object({ reviewerId: z.string().min(1) })
export type AssignReviewerDto = z.infer<typeof assignReviewerSchema>

export const approveVerificationSchema = z.object({
  expiresInDays: z.number().int().min(1).max(3650).default(365),
})
export type ApproveVerificationDto = z.infer<typeof approveVerificationSchema>

export const reasonSchema = z.object({ reason: z.string().trim().min(1).max(1000) })
export type ReasonDto = z.infer<typeof reasonSchema>

export const addVerificationNoteSchema = z.object({ body: z.string().trim().min(1).max(2000) })
export type AddVerificationNoteDto = z.infer<typeof addVerificationNoteSchema>

export const reviewDocumentSchema = z.object({
  documentId: z.string().min(1),
  status: verificationItemStatusSchema,
  note: z.string().trim().max(1000).optional(),
})
export type ReviewDocumentDto = z.infer<typeof reviewDocumentSchema>

export const listVerificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  sort: z.string().optional(),
  q: z.string().trim().optional(),
  status: verificationStatusSchema.optional(),
  accountId: z.string().optional(),
  reviewerId: z.string().optional(),
})
export type ListVerificationsQuery = z.infer<typeof listVerificationsQuerySchema>
