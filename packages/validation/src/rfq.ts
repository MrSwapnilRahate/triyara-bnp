import { z } from 'zod'

// RFQ Management contracts (TRY-BNP-RFQ-01).

export const RFQ_TYPES = ['BUYER', 'INTERNAL'] as const
export const rfqTypeSchema = z.enum(RFQ_TYPES)

export const RFQ_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ISSUED',
  'IN_PROGRESS',
  'EVALUATING',
  'AWARDED',
  'CLOSED',
  'CANCELLED',
  'EXPIRED',
] as const
export const rfqStatusSchema = z.enum(RFQ_STATUSES)
export type RFQStatusName = z.infer<typeof rfqStatusSchema>

export const RFQ_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const
export const rfqPrioritySchema = z.enum(RFQ_PRIORITIES)

export const RFQ_SUPPLIER_STATUSES = [
  'INVITED',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'SUBMITTED',
  'NO_RESPONSE',
  'WITHDRAWN',
] as const
export const rfqSupplierStatusSchema = z.enum(RFQ_SUPPLIER_STATUSES)

export const RFQ_APPROVAL_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const
export const rfqApprovalStatusSchema = z.enum(RFQ_APPROVAL_STATUSES)
export type RFQApprovalStatusName = z.infer<typeof rfqApprovalStatusSchema>

export const RFQ_ATTACHMENT_TYPES = [
  'SPECIFICATION',
  'DRAWING',
  'CERTIFICATE',
  'IMAGE',
  'PDF',
  'PRICE_SHEET',
  'OTHER',
] as const

// Reused vocabularies - declared by the catalog and supplier modules.
export const RFQ_INCOTERMS = [
  'EXW',
  'FCA',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
] as const
export const RFQ_CERTIFICATION_TYPES = [
  'ISO',
  'FSSAI',
  'HACCP',
  'APEDA',
  'FDA',
  'BRCGS',
  'HALAL',
  'KOSHER',
  'ORGANIC',
  'GMP',
  'SPICE_BOARD',
  'OTHER',
] as const

const iso2 = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 code.')
const iso4217 = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 code.')
const money = z.coerce.number().nonnegative().finite()

// ---- RFQ header ----

const rfqShape = {
  rfqNumber: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, digits and hyphens only.'),
  type: rfqTypeSchema.default('BUYER'),
  /** Required for BUYER, must be absent for INTERNAL - enforced by the service. */
  buyerId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(20000).optional(),
  currency: iso4217.optional(),
  incoterm: z.enum(RFQ_INCOTERMS).optional(),
  destinationCountry: iso2.optional(),
  destinationPort: z.string().trim().max(120).optional(),
  expectedShipmentDate: z.coerce.date().optional(),
  quotationDeadline: z.coerce.date().optional(),
  priority: rfqPrioritySchema.default('NORMAL'),
}

export const createRfqSchema = z.object(rfqShape)
export type CreateRfqDto = z.infer<typeof createRfqSchema>

export const updateRfqSchema = z.object({
  ...rfqShape,
  rfqNumber: z.string().trim().min(1).max(40).optional(),
  type: rfqTypeSchema.optional(),
  title: z.string().trim().min(1).max(250).optional(),
  priority: rfqPrioritySchema.optional(),
})
export type UpdateRfqDto = z.infer<typeof updateRfqSchema>

export const listRfqsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  /** Free text over rfqNumber, title and description. */
  q: z.string().trim().optional(),
  type: rfqTypeSchema.optional(),
  status: rfqStatusSchema.optional(),
  /**
   * Only RFQs a supplier can still be added to.
   *
   * A separate flag rather than a repeated `status` parameter because "open"
   * spans several states, and asking the caller to list them means every caller
   * has to know which ones — and they will drift apart the first time a state
   * is added.
   */
  openOnly: z.enum(['true', 'false']).optional(),
  priority: rfqPrioritySchema.optional(),
  buyerId: z.string().optional(),
  /** RFQs a given supplier was invited to. */
  supplierId: z.string().optional(),
  /** RFQs requesting a given catalog product. */
  productId: z.string().optional(),
  destinationCountry: z.string().trim().length(2).optional(),
  destinationPort: z.string().trim().optional(),
  deadlineBefore: z.coerce.date().optional(),
  deadlineAfter: z.coerce.date().optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  sort: z
    .enum([
      'createdAt',
      '-createdAt',
      'quotationDeadline',
      '-quotationDeadline',
      'rfqNumber',
      '-rfqNumber',
    ])
    .optional(),
})
export type ListRfqsQuery = z.infer<typeof listRfqsQuerySchema>

// ---- Line items ----

export const rfqItemSchema = z.object({
  /** Catalog product, or omit and supply customProductName. */
  productId: z.string().min(1).optional(),
  customProductName: z.string().trim().min(1).max(250).optional(),
  customProductDescription: z.string().trim().max(5000).optional(),
  quantity: z.coerce.number().positive().finite(),
  unit: z.string().trim().min(1).max(16),
  targetPrice: money.optional(),
  targetCurrency: iso4217.optional(),
  /** Buyer-stated specifications; free-form by design - see the design doc. */
  specifications: z.record(z.string(), z.unknown()).optional(),
  requiredCertifications: z.array(z.enum(RFQ_CERTIFICATION_TYPES)).max(20).default([]),
  packaging: z.string().trim().max(500).optional(),
  remarks: z.string().trim().max(2000).optional(),
})
export type RfqItemDto = z.infer<typeof rfqItemSchema>

export const replaceRfqItemsSchema = z.object({
  items: z.array(rfqItemSchema).min(1).max(200),
})
export type ReplaceRfqItemsDto = z.infer<typeof replaceRfqItemsSchema>

// ---- Supplier invitation ----

export const inviteSuppliersSchema = z.object({
  supplierIds: z.array(z.string().min(1)).min(1).max(100),
})
export type InviteSuppliersDto = z.infer<typeof inviteSuppliersSchema>

export const supplierParticipationSchema = z.object({
  status: rfqSupplierStatusSchema,
  declineReason: z.string().trim().max(1000).optional(),
})
export type SupplierParticipationDto = z.infer<typeof supplierParticipationSchema>

// ---- Supplier response (a bid) ----

export const rfqResponseLineSchema = z.object({
  rfqItemId: z.string().min(1),
  price: money,
  currency: iso4217,
  moq: money.optional(),
  moqUnit: z.string().trim().max(16).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  incoterm: z.enum(RFQ_INCOTERMS).optional(),
  port: z.string().trim().max(120).optional(),
  offeredProductId: z.string().min(1).optional(),
  offeredDescription: z.string().trim().max(500).optional(),
  remarks: z.string().trim().max(2000).optional(),
  validUntil: z.coerce.date().optional(),
})
export type RfqResponseLineDto = z.infer<typeof rfqResponseLineSchema>

export const submitResponseSchema = z.object({
  quotationCurrency: iso4217.optional(),
  quotationIncoterm: z.enum(RFQ_INCOTERMS).optional(),
  quotationPort: z.string().trim().max(120).optional(),
  quotationValidUntil: z.coerce.date().optional(),
  quotationRemarks: z.string().trim().max(5000).optional(),
  lines: z.array(rfqResponseLineSchema).min(1).max(200),
})
export type SubmitResponseDto = z.infer<typeof submitResponseSchema>

// ---- Comments, approvals ----

export const rfqCommentSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  parentId: z.string().min(1).optional(),
})
export type RfqCommentDto = z.infer<typeof rfqCommentSchema>

export const rfqApprovalSchema = z.object({
  decision: rfqApprovalStatusSchema,
  comments: z.string().trim().max(2000).optional(),
})
export type RfqApprovalDto = z.infer<typeof rfqApprovalSchema>

/**
 * Awarding a round. The body names the participation, not the supplier: a
 * supplier can only win a round they were actually invited to, and the
 * participation id makes that impossible to get wrong.
 */
export const rfqAwardSchema = z.object({
  participationId: z.string().min(1),
})
export type RfqAwardDto = z.infer<typeof rfqAwardSchema>

export const listResponsesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  rfqItemId: z.string().optional(),
  rfqSupplierId: z.string().optional(),
  currentOnly: z.enum(['true', 'false']).optional(),
})
export type ListResponsesQuery = z.infer<typeof listResponsesQuerySchema>
