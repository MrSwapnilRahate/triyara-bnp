import { z } from 'zod'

import { MAX_FILE_SIZE, mimeTypeSchema } from './document'

// Supplier Management contracts (TRY-BNP-SUPPLIER-02).
// Named supplier-management to avoid clashing with the frozen supplier.ts,
// which serves the frozen SupplierProfile module.

export const SUPPLIER_BUSINESS_TYPES = [
  'MANUFACTURER',
  'MANUFACTURER_EXPORTER',
  'MERCHANT_EXPORTER',
  'TRADER',
  'PROCESSOR',
  'FARMER_PRODUCER_ORGANISATION',
  'CONTRACT_MANUFACTURER',
  'OTHER',
] as const
export const supplierBusinessTypeSchema = z.enum(SUPPLIER_BUSINESS_TYPES)

export const SUPPLIER_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'BLOCKED',
  'INACTIVE',
] as const
export const supplierStatusSchema = z.enum(SUPPLIER_STATUSES)
export type SupplierStatusName = z.infer<typeof supplierStatusSchema>

export const APPROVAL_DECISIONS = [
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'BLOCKED',
  'UNBLOCKED',
  'REOPENED',
] as const
export const approvalDecisionSchema = z.enum(APPROVAL_DECISIONS)

export const SUPPLIER_CONTACT_ROLES = [
  'OWNER',
  'SALES',
  'EXPORT_MANAGER',
  'ACCOUNTS',
  'QUALITY',
  'LOGISTICS',
  'PRODUCTION',
  'OTHER',
] as const

export const SUPPLIER_ADDRESS_TYPES = [
  'REGISTERED_OFFICE',
  'FACTORY',
  'WAREHOUSE',
  'BRANCH',
  'DISPATCH_POINT',
] as const

export const CERTIFICATION_STATUSES = [
  'ACTIVE',
  'PENDING_RENEWAL',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED',
] as const

export const CERTIFICATION_TYPES = [
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

export const INCOTERMS = [
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

// ---- Supplier ----

const supplierShape = {
  supplierCode: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, digits and hyphens only.'),
  companyName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(250),
  businessType: supplierBusinessTypeSchema,
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(32).optional(),
  website: z.string().trim().url().max(300).optional(),
  /** India-specific; absent for foreign suppliers. */
  gstNumber: z.string().trim().max(20).optional(),
  iecNumber: z.string().trim().max(20).optional(),
  panNumber: z
    .string()
    .trim()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Must be a valid PAN.')
    .optional(),
  country: iso2.optional(),
  state: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  /** Optional link to the frozen Account aggregate. */
  accountId: z.string().min(1).optional(),
}

export const createSupplierSchema = z.object(supplierShape)
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>

export const updateSupplierSchema = z.object({
  ...supplierShape,
  supplierCode: z.string().trim().min(1).max(32).optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().min(1).max(250).optional(),
  businessType: supplierBusinessTypeSchema.optional(),
})
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>

export const listSuppliersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  /** Free text over company name, legal name, supplier code and city. */
  q: z.string().trim().optional(),
  status: supplierStatusSchema.optional(),
  businessType: supplierBusinessTypeSchema.optional(),
  country: z.string().trim().length(2).optional(),
  city: z.string().trim().optional(),
  isVerified: z.enum(['true', 'false']).optional(),
  /** Suppliers offering a specific catalog product. */
  productId: z.string().optional(),
  /**
   * Upper bound on the OFFERING's minimum order quantity.
   *
   * Deliberately not `Supplier.moq`, which is free text ("1 x 20ft container")
   * and cannot be compared. Combined with `productId` this asks one question of
   * one offering: who can supply THIS product at or below THIS quantity.
   */
  maxMoq: z.coerce.number().nonnegative().finite().optional(),
  /** Suppliers currently holding this certification. */
  certification: z.enum(CERTIFICATION_TYPES).optional(),
  /** Substring, because both columns are free text on the supplier record. */
  packaging: z.string().trim().max(200).optional(),
  paymentTerms: z.string().trim().max(200).optional(),
  /** Exact membership of the supplier's export markets. */
  exportCountry: z.string().trim().length(2).optional(),
  tagId: z.string().optional(),
  gstNumber: z.string().trim().optional(),
  iecNumber: z.string().trim().optional(),
  panNumber: z.string().trim().optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  sort: z
    .enum([
      'createdAt',
      '-createdAt',
      'companyName',
      '-companyName',
      'supplierCode',
      '-supplierCode',
    ])
    .optional(),
})
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>

// ---- Approval workflow ----

export const supplierApprovalSchema = z.object({
  decision: approvalDecisionSchema,
  comments: z.string().trim().max(2000).optional(),
})
export type SupplierApprovalDto = z.infer<typeof supplierApprovalSchema>

// ---- Owned collections ----

export const supplierContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.enum(SUPPLIER_CONTACT_ROLES).default('OTHER'),
  designation: z.string().trim().max(200).optional(),
  // `''` is accepted alongside `undefined`: a form posts empty strings for the
  // fields nobody filled in, and a contact reached only on WhatsApp is the
  // ordinary case here. The service maps blank to null before it stores
  // anything, so an empty string never reaches the column.
  email: z.union([z.string().trim().email().max(320), z.literal('')]).optional(),
  phone: z.string().trim().max(32).optional(),
  whatsapp: z.string().trim().max(32).optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
})
export type SupplierContactDto = z.infer<typeof supplierContactSchema>
/**
 * What a FORM holds before zod applies defaults. `role` and `isPrimary` carry
 * `.default()`, so they are optional on the way in and guaranteed on the way
 * out - and react-hook-form needs the input side to type its field values.
 */
export type SupplierContactInput = z.input<typeof supplierContactSchema>

/**
 * Editing one contact. Every field optional so a caller may correct a phone
 * number without restating the person - and `.partial()` over the create
 * schema rather than a restatement, so the two cannot drift.
 */
export const updateSupplierContactSchema = supplierContactSchema.partial()
export type UpdateSupplierContactDto = z.infer<typeof updateSupplierContactSchema>

export const supplierAddressSchema = z.object({
  type: z.enum(SUPPLIER_ADDRESS_TYPES),
  label: z.string().trim().max(120).optional(),
  line1: z.string().trim().min(1).max(250),
  line2: z.string().trim().max(250).optional(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: iso2,
  isPrimary: z.boolean().default(false),
  /** Meaningful only when type = FACTORY. */
  factorySizeSqm: z.coerce.number().int().positive().optional(),
  productionLines: z.coerce.number().int().positive().optional(),
  employeeCount: z.coerce.number().int().positive().optional(),
  establishedYear: z.coerce.number().int().min(1800).max(2200).optional(),
  isOwnedPremises: z.boolean().optional(),
})
export type SupplierAddressDto = z.infer<typeof supplierAddressSchema>

/**
 * Treats an empty form field as "not provided" rather than as a bad value.
 * A date input posts `''` for the days nobody filled in, and `z.coerce.date()`
 * would otherwise turn that into an Invalid Date - making a certificate or
 * document with no recorded expiry impossible to save.
 */
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema)

export const supplierCertificationSchema = z.object({
  type: z.enum(CERTIFICATION_TYPES),
  certificateNumber: z.string().trim().min(1).max(120),
  issuedBy: z.string().trim().max(200).optional(),
  // A date input posts `''` for the days nobody filled in, and
  // `z.coerce.date()` turns that into an Invalid Date rather than "absent" -
  // which would make a certificate with no recorded expiry impossible to save.
  // Blank is normalised to undefined before coercion; the column stays null.
  issuedDate: blankToUndefined(z.coerce.date().optional()),
  expiryDate: blankToUndefined(z.coerce.date().optional()),
  scope: z.string().trim().max(500).optional(),
  /** Present on the model; a desk marks a certificate SUSPENDED or EXPIRED. */
  status: z.enum(CERTIFICATION_STATUSES).optional(),
})
export type SupplierCertificationDto = z.infer<typeof supplierCertificationSchema>
/** What a FORM holds before zod applies defaults. */
export type SupplierCertificationInput = z.input<typeof supplierCertificationSchema>

/**
 * Editing one certification. Every field optional so a caller may correct an
 * expiry date without restating the certificate - and `.partial()` over the
 * create schema rather than a restatement, so the two cannot drift.
 */
export const updateSupplierCertificationSchema = supplierCertificationSchema.partial()
export type UpdateSupplierCertificationDto = z.infer<typeof updateSupplierCertificationSchema>

// ---- Notes (the CRM timeline) ----

/** The channels a supplier actually reaches Triyara on. */
export const SUPPLIER_NOTE_SOURCES = [
  'WHATSAPP',
  'INSTAGRAM',
  'LINKEDIN',
  'EMAIL',
  'PHONE',
  'TRADEINDIA',
  'INDIAMART',
  'OTHER',
] as const
export const supplierNoteSourceSchema = z.enum(SUPPLIER_NOTE_SOURCES)

/**
 * Notes are pasted from chat threads, so the ceiling is generous and the body
 * is trimmed but never reshaped. `min(1)` after trimming rejects a note that is
 * only whitespace, which would otherwise sit in the timeline saying nothing.
 */
const noteBody = z.string().trim().min(1, 'A note needs some text.').max(10_000)

export const supplierNoteSchema = z.object({
  body: noteBody,
  source: supplierNoteSourceSchema.optional(),
})
export type SupplierNoteDto = z.infer<typeof supplierNoteSchema>

/**
 * Every field optional, but at least one required: a PATCH that changes nothing
 * still costs a version bump, so it is a client bug worth reporting.
 */
export const updateSupplierNoteSchema = z
  .object({
    body: noteBody.optional(),
    /** Explicit null clears the channel; absent leaves it untouched. */
    source: supplierNoteSourceSchema.nullable().optional(),
  })
  .refine((v) => v.body !== undefined || v.source !== undefined, {
    message: 'Provide a body or a source to update.',
  })
export type UpdateSupplierNoteDto = z.infer<typeof updateSupplierNoteSchema>

export const listSupplierNotesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  source: supplierNoteSourceSchema.optional(),
  authorId: z.string().optional(),
})
export type ListSupplierNotesQuery = z.infer<typeof listSupplierNotesQuerySchema>

// ---- Product offerings (the catalog bridge) ----

export const supplierOfferingSchema = z.object({
  productId: z.string().min(1),
  supplierSku: z.string().trim().max(64).optional(),
  moq: money.optional(),
  moqUnit: z.string().trim().max(16).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  isPreferred: z.boolean().default(false),
  price: money.optional(),
  currency: iso4217.optional(),
  incoterm: z.enum(INCOTERMS).optional(),
  port: z.string().trim().max(120).optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'DISCONTINUED']).default('ACTIVE'),
  notes: z.string().trim().max(1000).optional(),
})
export type SupplierOfferingDto = z.infer<typeof supplierOfferingSchema>

export const listOfferingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  supplierId: z.string().optional(),
  productId: z.string().optional(),
  status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'DISCONTINUED']).optional(),
  isPreferred: z.enum(['true', 'false']).optional(),
})
export type ListOfferingsQuery = z.infer<typeof listOfferingsQuerySchema>

// ---- Capacity ----

export const supplierCapacitySchema = z.object({
  productId: z.string().min(1).optional(),
  addressId: z.string().min(1).optional(),
  capacity: z.coerce.number().positive().finite(),
  unit: z.string().trim().min(1).max(16),
  frequency: z.enum(['PER_DAY', 'PER_WEEK', 'PER_MONTH', 'PER_QUARTER', 'PER_YEAR', 'PER_SEASON']),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
})
export type SupplierCapacityDto = z.infer<typeof supplierCapacitySchema>

// ---- Performance ----

const score = z.coerce.number().min(0).max(100)

export const supplierPerformanceSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  deliveryScore: score.optional(),
  qualityScore: score.optional(),
  communicationScore: score.optional(),
  documentationScore: score.optional(),
  responsivenessScore: score.optional(),
  ordersCount: z.coerce.number().int().min(0).optional(),
  onTimeDeliveryRate: score.optional(),
  rejectionRate: score.optional(),
  source: z.enum(['MANUAL', 'COMPUTED', 'IMPORTED']).default('MANUAL'),
  notes: z.string().trim().max(2000).optional(),
})
export type SupplierPerformanceDto = z.infer<typeof supplierPerformanceSchema>

// ---- REST API query contracts (TRY-BNP-SUPPLIER-API) ----

/**
 * Typeahead search. `q` is required - an empty search is a list, and the two
 * have different defaults, so they are different endpoints rather than one
 * endpoint with an optional parameter.
 */
export const searchSuppliersQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search needs at least 2 characters.').max(120),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  status: supplierStatusSchema.optional(),
  /** Restrict to suppliers offering this catalog product. */
  productId: z.string().optional(),
  country: z.string().trim().length(2).optional(),
})
export type SearchSuppliersQuery = z.infer<typeof searchSuppliersQuerySchema>

/** Facet endpoints report what the tenant HAS, so deleted rows are excluded. */
export const supplierFacetQuerySchema = z.object({
  includeDeleted: z.enum(['true', 'false']).optional(),
})
export type SupplierFacetQuery = z.infer<typeof supplierFacetQuerySchema>

/** Paging for a supplier's RFQ and quotation history. */
export const supplierHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
})
export type SupplierHistoryQuery = z.infer<typeof supplierHistoryQuerySchema>

/** `GET /api/suppliers/:id/products` - offerings scoped to one supplier. */
export const listSupplierProductsQuerySchema = listOfferingsQuerySchema.omit({ supplierId: true })
export type ListSupplierProductsQuery = z.infer<typeof listSupplierProductsQuerySchema>

// ---- Supplier documents (TRY-BNP-SUPPLIER-DOC) ----

export const SUPPLIER_DOCUMENT_TYPES = [
  'GST',
  'IEC',
  'PAN',
  'CANCELLED_CHEQUE',
  'MSME',
  'IMPORT_EXPORT_LICENSE',
  'FACTORY_LICENSE',
  'FACTORY_PHOTOS',
  'COMPANY_PROFILE',
  'CATALOG',
  'LAB_REPORT',
  'AGREEMENT',
  'OTHER',
] as const

/** Step one of the upload: ask for somewhere to put the bytes. */
export const presignSupplierDocumentSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  // The platform's existing allow-list, not a looser one: a supplier document
  // is the same class of file as any other and gets the same restriction.
  mimeType: mimeTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE),
})
export type PresignSupplierDocumentDto = z.infer<typeof presignSupplierDocumentSchema>

/**
 * Step two: record the row once the bytes are up.
 *
 * `fileSize` and `checksum` are absent on purpose - the service reads both
 * from storage rather than believing the browser, so they cannot be claimed.
 */
export const supplierDocumentSchema = z.object({
  type: z.enum(SUPPLIER_DOCUMENT_TYPES),
  storageKey: z.string().trim().min(1).max(500),
  mimeType: mimeTypeSchema.optional(),
  title: z.string().trim().max(250).optional(),
  documentNumber: z.string().trim().max(120).optional(),
  issuedDate: blankToUndefined(z.coerce.date().optional()),
  expiryDate: blankToUndefined(z.coerce.date().optional()),
})
export type SupplierDocumentDto = z.infer<typeof supplierDocumentSchema>
export type SupplierDocumentInput = z.input<typeof supplierDocumentSchema>

/**
 * Editing. `storageKey` optional: present when a newer file replaces the old
 * one, absent when only the metadata is being corrected.
 */
export const updateSupplierDocumentSchema = supplierDocumentSchema.partial()
export type UpdateSupplierDocumentDto = z.infer<typeof updateSupplierDocumentSchema>
