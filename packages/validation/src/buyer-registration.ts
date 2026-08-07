import { z } from 'zod'

import { buyerTypeSchema, importExperienceSchema } from './buyer'
import { documentTypeSchema, mimeTypeSchema } from './document'
import {
  iso2,
  optionalEmail,
  optionalText,
  optionalUrl,
  shortList,
} from './registration-primitives'
import { approvalDecisionSchema } from './supplier-management'

// Public buyer registration (TRY-BNP-BUYER-REG).
//
// The mirror of supplier registration, and deliberately built from the same
// parts: the field primitives, the document shape and the presign contract are
// imported, not restated. Only what is genuinely different about a buyer — what
// they want to buy, where it must land, on what terms — is defined here.
//
// The same two rules apply. Only what an enquiry is useless without is
// required, because a buyer who cannot yet name a destination port must still
// be able to reach us. And every ceiling is explicit, because this endpoint is
// unauthenticated.

// ---- Step 1: company ----

export const buyerCompanySchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required.').max(200),
  /** Falls back to companyName when a buyer does not distinguish the two. */
  legalName: optionalText(250),
  businessType: buyerTypeSchema.optional(),
  country: iso2,
  city: optionalText(120),
  website: optionalUrl(),
  // The module's own vocabulary, not a second one: NEW / YEARS_1_3 /
  // YEARS_3_PLUS is what BuyerProfile already stores.
  importExperience: importExperienceSchema.optional(),
})

// ---- Step 2: buyer contact ----

/**
 * The one part that must be complete. Without a named person and a way to
 * reach them, an enquiry cannot be answered and the submission is wasted.
 * Email OR phone OR WhatsApp satisfies it — the same allowance the supplier
 * form makes, for the same reason.
 */
export const buyerContactSchema = z
  .object({
    name: z.string().trim().min(1, 'Contact name is required.').max(200),
    designation: optionalText(200),
    email: optionalEmail(),
    phone: optionalText(32),
    whatsapp: optionalText(32),
  })
  .refine((v) => Boolean(v.email ?? v.phone ?? v.whatsapp), {
    message: 'Give us at least one of email, phone or WhatsApp so we can reach you.',
    path: ['email'],
  })

// ---- Step 3: what they want to buy ----

/**
 * One product line. Free text rather than a catalog id: a buyer describes what
 * they want in their own words, and `BuyerProduct.product` is a string for
 * exactly that reason. Quantity and price are strings too — "2 containers a
 * month" and "around $1800 CIF" are the answers people actually give.
 */
export const buyerProductSchema = z.object({
  product: z.string().trim().min(1, 'Name the product.').max(200),
  targetVolume: optionalText(120),
  targetPrice: optionalText(120),
  frequency: optionalText(120),
})

export const buyerRequirementSchema = z.object({
  products: z.array(buyerProductSchema).max(50).default([]),
  annualRequirement: optionalText(200),
  packaging: optionalText(500),
})

// ---- Step 4: destination and terms ----

export const buyerLogisticsSchema = z.object({
  destinationCountries: z.array(iso2).max(200).default([]),
  destinationPort: optionalText(120),
  incoterms: shortList(20, 12),
  paymentTerms: shortList(20, 200),
  certificationsRequired: shortList(30, 60),
  languages: shortList(30, 60),
})

// ---- Step 5: documents ----

/**
 * Same upload pipeline as the supplier form, but NOT the same type vocabulary.
 *
 * A buyer's attachments are stored in the Document module, whose `type` column
 * is `DocumentType` — and `SUPPLIER_DOCUMENT_TYPES` is a different list. Five of
 * its values (CATALOG, FACTORY_PHOTOS, LAB_REPORT, AGREEMENT, CANCELLED_CHEQUE)
 * do not exist in `DocumentType`, so reusing the supplier schema here would let
 * a submission validate and then fail at the database. Shape reused, vocabulary
 * taken from the module that actually stores the row.
 */
export const buyerDocumentSchema = z.object({
  type: documentTypeSchema,
  storageKey: z.string().trim().min(1).max(500),
  fileName: optionalText(200),
  mimeType: mimeTypeSchema.optional(),
})

// ---- The whole submission ----

export const buyerRegistrationSchema = z.object({
  company: buyerCompanySchema,
  contact: buyerContactSchema,
  requirement: buyerRequirementSchema.default({ products: [] }),
  logistics: buyerLogisticsSchema.default({
    destinationCountries: [],
    incoterms: [],
    paymentTerms: [],
    certificationsRequired: [],
    languages: [],
  }),
  documents: z.array(buyerDocumentSchema).max(30).default([]),
  /** "Anything else you want us to know?" */
  notes: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(5000).optional(),
  ),
})
export type BuyerRegistrationDto = z.infer<typeof buyerRegistrationSchema>
export type BuyerRegistrationInput = z.input<typeof buyerRegistrationSchema>

/**
 * A review decision. Identical in shape to the supplier one and built from the
 * same `approvalDecisionSchema`, so the two vocabularies cannot drift apart —
 * the shared transition guard in core reads both.
 */
export const buyerApprovalSchema = z.object({
  decision: approvalDecisionSchema,
  comments: z.string().trim().max(2000).optional(),
})
export type BuyerApprovalDto = z.infer<typeof buyerApprovalSchema>
