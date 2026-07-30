import { z } from 'zod'

// Quotation Engine contracts (TRY-BNP-QUOTE-01).

export const QUOTATION_TYPES = ['BUDGETARY', 'FIRM', 'PROFORMA'] as const
export const quotationTypeSchema = z.enum(QUOTATION_TYPES)

export const QUOTATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'UNDER_NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'WITHDRAWN',
  'SUPERSEDED',
] as const
export const quotationStatusSchema = z.enum(QUOTATION_STATUSES)
export type QuotationStatusName = z.infer<typeof quotationStatusSchema>

export const QUOTATION_APPROVAL_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const
export const quotationApprovalStatusSchema = z.enum(QUOTATION_APPROVAL_STATUSES)

// Shared vocabularies - reused by Purchase Orders and Invoices later.
export const CHARGE_TYPES = [
  'FREIGHT',
  'INSURANCE',
  'PACKING',
  'SAMPLING',
  'HANDLING',
  'INSPECTION',
  'CERTIFICATION',
  'DOCUMENTATION',
  'BANK_CHARGES',
  'DISCOUNT',
  'SURCHARGE',
  'OTHER',
] as const
export const chargeTypeSchema = z.enum(CHARGE_TYPES)

export const CHARGE_BASES = [
  'FIXED_AMOUNT',
  'PERCENTAGE',
  'PER_UNIT',
  'PER_WEIGHT',
  'PER_CONTAINER',
] as const
export const chargeBasisSchema = z.enum(CHARGE_BASES)

export const CHARGE_SCOPES = ['HEADER', 'LINE'] as const
export const chargeScopeSchema = z.enum(CHARGE_SCOPES)

export const TAX_TYPES = [
  'GST',
  'IGST',
  'CGST',
  'SGST',
  'VAT',
  'CUSTOMS_DUTY',
  'CESS',
  'WITHHOLDING',
  'OTHER',
] as const
export const taxTypeSchema = z.enum(TAX_TYPES)

export const EXCHANGE_RATE_SOURCES = ['MANUAL', 'RBI', 'ECB', 'MARKET_FEED', 'IMPORTED'] as const
export const exchangeRateSourceSchema = z.enum(EXCHANGE_RATE_SOURCES)

export const QUOTATION_INCOTERMS = [
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
const percent = z.coerce.number().min(0).max(100)

// ---- Cross-cutting master data ----

export const paymentTermSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, 'Uppercase letters, digits, underscores and hyphens only.'),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  netDays: z.coerce.number().int().min(0).max(3650).optional(),
  advancePercent: percent.optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
})
export type PaymentTermDto = z.infer<typeof paymentTermSchema>

export const exchangeRateSchema = z.object({
  fromCurrency: iso4217,
  toCurrency: iso4217,
  rate: z.coerce.number().positive().finite(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  source: exchangeRateSourceSchema.default('MANUAL'),
})
export type ExchangeRateDto = z.infer<typeof exchangeRateSchema>

// ---- Quotation header ----

const quotationShape = {
  quotationNumber: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, digits and hyphens only.'),
  type: quotationTypeSchema.default('FIRM'),
  buyerId: z.string().min(1),
  /** Convenience pointer; per-line provenance is QuotationItem.rfqItemId. */
  primaryRfqId: z.string().min(1).optional(),
  title: z.string().trim().max(250).optional(),
  description: z.string().trim().max(20000).optional(),
  currency: iso4217,
  baseCurrency: iso4217,
  incoterm: z.enum(QUOTATION_INCOTERMS).optional(),
  namedPlace: z.string().trim().max(160).optional(),
  destinationCountry: iso2.optional(),
  destinationPort: z.string().trim().max(120).optional(),
  paymentTermId: z.string().min(1).optional(),
  paymentTermsText: z.string().trim().max(2000).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  packingSummary: z.string().trim().max(1000).optional(),
  samplingTerms: z.string().trim().max(1000).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
}

export const createQuotationSchema = z.object(quotationShape)
export type CreateQuotationDto = z.infer<typeof createQuotationSchema>

export const updateQuotationSchema = z.object({
  ...quotationShape,
  quotationNumber: z.string().trim().min(1).max(40).optional(),
  type: quotationTypeSchema.optional(),
  buyerId: z.string().min(1).optional(),
  currency: iso4217.optional(),
  baseCurrency: iso4217.optional(),
})
export type UpdateQuotationDto = z.infer<typeof updateQuotationSchema>

export const listQuotationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  /** Free text over quotationNumber and title. */
  q: z.string().trim().optional(),
  type: quotationTypeSchema.optional(),
  status: quotationStatusSchema.optional(),
  buyerId: z.string().optional(),
  rfqId: z.string().optional(),
  currency: z.string().trim().length(3).optional(),
  /** Latest revision only, excluding superseded documents. */
  currentOnly: z.enum(['true', 'false']).optional(),
  validBefore: z.coerce.date().optional(),
  validAfter: z.coerce.date().optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  sort: z
    .enum([
      'createdAt',
      '-createdAt',
      'validUntil',
      '-validUntil',
      'grandTotal',
      '-grandTotal',
      'quotationNumber',
      '-quotationNumber',
    ])
    .optional(),
})
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>

// ---- Lines ----

export const quotationItemSchema = z.object({
  productId: z.string().min(1).optional(),
  customProductName: z.string().trim().min(1).max(250).optional(),
  description: z.string().trim().max(5000).optional(),
  /** Per-line provenance: the RFQ line this answers. */
  rfqItemId: z.string().min(1).optional(),
  quantity: z.coerce.number().positive().finite(),
  unit: z.string().trim().min(1).max(16),
  /** INTERNAL - never rendered to the customer. */
  unitCost: money.optional(),
  marginPercent: z.coerce.number().min(-100).max(1000).optional(),
  unitPrice: money,
  packaging: z.string().trim().max(500).optional(),
  hsCode: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/, 'Must be 6-12 digits.')
    .optional(),
  countryOfOrigin: iso2.optional(),
  requiredCertifications: z
    .array(
      z.enum([
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
      ]),
    )
    .max(20)
    .default([]),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  remarks: z.string().trim().max(2000).optional(),
})
export type QuotationItemDto = z.infer<typeof quotationItemSchema>

export const replaceQuotationItemsSchema = z.object({
  items: z.array(quotationItemSchema).min(1).max(200),
  reason: z.string().trim().max(500).optional(),
})
export type ReplaceQuotationItemsDto = z.infer<typeof replaceQuotationItemsSchema>

// ---- Sourcing options (price + supplier comparison, winner selection) ----

export const sourceOptionSchema = z.object({
  supplierId: z.string().min(1),
  /** The specific supplier bid this option is costed from. */
  rfqSupplierResponseId: z.string().min(1).optional(),
  supplierPrice: money,
  supplierCurrency: iso4217,
  fxRate: z.coerce.number().positive().finite().optional(),
  /** Converted and freight/duty loaded - the only comparable number. */
  landedUnitCost: money,
  moq: money.optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  incoterm: z.enum(QUOTATION_INCOTERMS).optional(),
  port: z.string().trim().max(120).optional(),
})
export type SourceOptionDto = z.infer<typeof sourceOptionSchema>

export const selectSourceOptionSchema = z.object({
  selectionReason: z.string().trim().max(1000).optional(),
})
export type SelectSourceOptionDto = z.infer<typeof selectSourceOptionSchema>

// ---- Pricing conditions ----

export const quotationChargeSchema = z.object({
  /** Null/omitted = header charge; set = line charge. */
  quotationItemId: z.string().min(1).optional(),
  type: chargeTypeSchema,
  scope: chargeScopeSchema.default('HEADER'),
  basis: chargeBasisSchema.default('FIXED_AMOUNT'),
  label: z.string().trim().max(160).optional(),
  rate: z.coerce.number().finite().optional(),
  amount: money,
  currency: iso4217,
  /** True for DISCOUNT and any other deduction. */
  isDeduction: z.boolean().default(false),
  sequence: z.coerce.number().int().min(0).default(0),
  isVisibleToCustomer: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
})
export type QuotationChargeDto = z.infer<typeof quotationChargeSchema>

export const quotationTaxSchema = z.object({
  quotationItemId: z.string().min(1).optional(),
  type: taxTypeSchema,
  code: z.string().trim().max(32).optional(),
  jurisdiction: z.string().trim().max(120).optional(),
  ratePercent: percent,
  taxableAmount: money,
  amount: money,
  currency: iso4217,
  isCompound: z.boolean().default(false),
  isReverseCharge: z.boolean().default(false),
  sequence: z.coerce.number().int().min(0).default(0),
})
export type QuotationTaxDto = z.infer<typeof quotationTaxSchema>

// ---- Approvals, comments, revisions ----

export const quotationApprovalSchema = z.object({
  decision: quotationApprovalStatusSchema,
  comments: z.string().trim().max(2000).optional(),
})
export type QuotationApprovalDto = z.infer<typeof quotationApprovalSchema>

export const quotationCommentSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  parentId: z.string().min(1).optional(),
})
export type QuotationCommentDto = z.infer<typeof quotationCommentSchema>

export const reviseQuotationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
})
export type ReviseQuotationDto = z.infer<typeof reviseQuotationSchema>
