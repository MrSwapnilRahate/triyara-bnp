import { z } from 'zod'

import { MAX_FILE_SIZE, mimeTypeSchema } from './document'
import {
  CERTIFICATION_TYPES,
  SUPPLIER_BUSINESS_TYPES,
  SUPPLIER_DOCUMENT_TYPES,
} from './supplier-management'

// Public supplier registration (TRY-BNP-SUPPLIER-REG).
//
// The contract for a form filled in by someone with no account, no session and
// no support channel open. Two consequences run through everything below:
//
//   1. Only what a company genuinely cannot be registered without is required.
//     A supplier who does not yet know their container capacity must still be
//     able to reach us; the review team can ask later. Over-validating a public
//     form does not improve data quality, it just loses the supplier.
//   2. Every ceiling is explicit. This endpoint is unauthenticated, so the
//     schema is the first thing standing between the internet and the database.

/** Trims, then treats an empty field as absent rather than as a bad value. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  )

const iso2 = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 code.')

/**
 * Bounded list of short free-text entries.
 *
 * Registrants paste comma-separated lists into these, so the cap is on both the
 * number of entries and the length of each: one without the other still lets a
 * single request carry an unbounded payload.
 */
const shortList = (maxItems: number, maxLen = 120) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).default([])

// ---- Step 1: company ----

export const registrationCompanySchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required.').max(200),
  legalName: z.string().trim().min(1, 'Legal name is required.').max(250),
  businessType: z.enum(SUPPLIER_BUSINESS_TYPES),
  country: iso2,
  state: optionalText(120),
  city: optionalText(120),
  gstNumber: optionalText(20),
  iecNumber: optionalText(20),
  website: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().url('Must be a full URL, including https://').max(300).optional(),
  ),
  establishedYear: z.coerce.number().int().min(1800).max(2200).optional(),
  employeeCount: z.coerce.number().int().min(1).max(10_000_000).optional(),
})

// ---- Step 2: primary contact ----

/**
 * The one part of the form that must be complete: without a way to reach a
 * named person, a registration is not actionable and the whole submission is
 * wasted. Email OR mobile satisfies it — plenty of suppliers here work on
 * WhatsApp alone and have no working email address.
 */
export const registrationContactSchema = z
  .object({
    name: z.string().trim().min(1, 'Contact name is required.').max(200),
    designation: optionalText(200),
    email: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().email('Must be a valid email address.').max(320).optional(),
    ),
    mobile: optionalText(32),
    whatsapp: optionalText(32),
  })
  .refine((v) => Boolean(v.email ?? v.mobile ?? v.whatsapp), {
    message: 'Give us at least one of email, mobile or WhatsApp so we can reach you.',
    path: ['email'],
  })

// ---- Step 3: products ----

export const registrationProductsSchema = z.object({
  /** Existing catalog products the supplier picked. */
  productIds: z.array(z.string().min(1)).max(100).default([]),
  /** Anything they supply that the catalog does not list yet. */
  proposedProducts: shortList(100, 200),
  moq: optionalText(120),
  productionCapacity: optionalText(120),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
})

// ---- Step 4: certifications ----

/**
 * A CLAIM, not a certification.
 *
 * `SupplierCertification` requires a certificateNumber and asserts that the
 * supplier holds the certificate — a statement only a reviewer who has read the
 * scan is entitled to make. So registration records the claimed type and files
 * the scan as a document; the reviewer creates the real certification during
 * verification. Writing certification rows straight from a public form would
 * let an unverified applicant appear certified.
 */
export const registrationCertificationSchema = z.object({
  type: z.enum(CERTIFICATION_TYPES),
  /** Present once the scan has uploaded. The scan itself is optional. */
  storageKey: optionalText(500),
  fileName: optionalText(200),
  mimeType: mimeTypeSchema.optional(),
})

// ---- Step 5: documents ----

export const registrationDocumentSchema = z.object({
  type: z.enum(SUPPLIER_DOCUMENT_TYPES),
  storageKey: z.string().trim().min(1).max(500),
  fileName: optionalText(200),
  mimeType: mimeTypeSchema.optional(),
})

// ---- Step 6: business details ----

export const registrationBusinessSchema = z.object({
  exportCountries: z.array(iso2).max(200).default([]),
  shippingPorts: shortList(50),
  languages: shortList(30, 60),
  packaging: optionalText(500),
  paymentTerms: optionalText(500),
  containerCapacity: optionalText(120),
})

// ---- The whole submission ----

export const supplierRegistrationSchema = z.object({
  company: registrationCompanySchema,
  contact: registrationContactSchema,
  products: registrationProductsSchema.default({ productIds: [], proposedProducts: [] }),
  certifications: z.array(registrationCertificationSchema).max(30).default([]),
  documents: z.array(registrationDocumentSchema).max(30).default([]),
  business: registrationBusinessSchema.default({
    exportCountries: [],
    shippingPorts: [],
    languages: [],
  }),
  /** "Anything else you want us to know?" */
  notes: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(5000).optional(),
  ),
})
export type SupplierRegistrationDto = z.infer<typeof supplierRegistrationSchema>
export type SupplierRegistrationInput = z.input<typeof supplierRegistrationSchema>

/**
 * Presign for an unauthenticated uploader.
 *
 * Deliberately the same shape and the same `mimeTypeSchema` allow-list as the
 * authenticated supplier-document presign. A public caller gets no wider
 * latitude over what may be written to our storage than a member of staff.
 */
export const presignRegistrationUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: mimeTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE),
})
export type PresignRegistrationUploadDto = z.infer<typeof presignRegistrationUploadSchema>
