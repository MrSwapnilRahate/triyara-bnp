import { z } from 'zod'

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

export const supplierCertificationSchema = z.object({
  type: z.enum(CERTIFICATION_TYPES),
  certificateNumber: z.string().trim().min(1).max(120),
  issuedBy: z.string().trim().max(200).optional(),
  issuedDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  scope: z.string().trim().max(500).optional(),
})
export type SupplierCertificationDto = z.infer<typeof supplierCertificationSchema>

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

/** `GET /api/suppliers/:id/products` - offerings scoped to one supplier. */
export const listSupplierProductsQuerySchema = listOfferingsQuerySchema.omit({ supplierId: true })
export type ListSupplierProductsQuery = z.infer<typeof listSupplierProductsQuerySchema>
