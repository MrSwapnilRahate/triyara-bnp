import type { SupplierRegistrationInput } from '@triyara/validation'

/**
 * What the wizard holds while it is being filled in.
 *
 * Every field is a string or an array of strings, including the numeric ones:
 * a half-typed year is `"20"`, which is not a number, and coercing on every
 * keystroke would fight the person typing. Zod coerces at the boundary, once,
 * when the form is submitted.
 */
export interface RegistrationDraft {
  company: {
    companyName: string
    legalName: string
    businessType: string
    country: string
    state: string
    city: string
    gstNumber: string
    iecNumber: string
    website: string
    establishedYear: string
    employeeCount: string
  }
  contact: {
    name: string
    designation: string
    email: string
    mobile: string
    whatsapp: string
  }
  products: {
    productIds: string[]
    proposedProducts: string[]
    moq: string
    productionCapacity: string
    leadTimeDays: string
  }
  certifications: UploadedCertification[]
  documents: UploadedDocument[]
  business: {
    exportCountries: string[]
    shippingPorts: string[]
    languages: string[]
    packaging: string
    paymentTerms: string
    containerCapacity: string
  }
  notes: string
}

export interface UploadedCertification {
  type: string
  storageKey?: string
  fileName?: string
  mimeType?: string
}

export interface UploadedDocument {
  type: string
  storageKey: string
  fileName?: string
  mimeType?: string
}

export const EMPTY_DRAFT: RegistrationDraft = {
  company: {
    companyName: '',
    legalName: '',
    businessType: '',
    country: '',
    state: '',
    city: '',
    gstNumber: '',
    iecNumber: '',
    website: '',
    establishedYear: '',
    employeeCount: '',
  },
  contact: { name: '', designation: '', email: '', mobile: '', whatsapp: '' },
  products: {
    productIds: [],
    proposedProducts: [],
    moq: '',
    productionCapacity: '',
    leadTimeDays: '',
  },
  certifications: [],
  documents: [],
  business: {
    exportCountries: [],
    shippingPorts: [],
    languages: [],
    packaging: '',
    paymentTerms: '',
    containerCapacity: '',
  },
  notes: '',
}

/** A finite number, or nothing at all. Never NaN. */
function toNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Turns the draft into the API payload.
 *
 * Assembled by mutation rather than by spreading conditionals: `...(x ? {k:v} :
 * {})` produces a union per optional field, and TypeScript multiplies those
 * into thousands of shapes it then cannot match against the target. Assigning
 * onto a typed object keeps the checking real and the error messages readable.
 *
 * Blank optionals are omitted, so the request says what was answered rather
 * than listing every question that was not.
 */
export function draftToPayload(draft: RegistrationDraft): SupplierRegistrationInput {
  const c = draft.company
  const company: SupplierRegistrationInput['company'] = {
    companyName: c.companyName.trim(),
    legalName: c.legalName.trim(),
    businessType: c.businessType as SupplierRegistrationInput['company']['businessType'],
    country: c.country.trim().toUpperCase(),
  }
  if (c.state.trim()) company.state = c.state.trim()
  if (c.city.trim()) company.city = c.city.trim()
  if (c.gstNumber.trim()) company.gstNumber = c.gstNumber.trim()
  if (c.iecNumber.trim()) company.iecNumber = c.iecNumber.trim()
  if (c.website.trim()) company.website = c.website.trim()
  // `z.coerce.number()` still declares its INPUT as number, so the string the
  // form holds has to become one here. A field left as "" or as something
  // unparseable is omitted rather than sent as NaN, which would fail
  // validation with a message about a number nobody typed.
  const year = toNumber(c.establishedYear)
  if (year !== undefined) company.establishedYear = year
  const staff = toNumber(c.employeeCount)
  if (staff !== undefined) company.employeeCount = staff

  const k = draft.contact
  const contact: SupplierRegistrationInput['contact'] = { name: k.name.trim() }
  if (k.designation.trim()) contact.designation = k.designation.trim()
  if (k.email.trim()) contact.email = k.email.trim()
  if (k.mobile.trim()) contact.mobile = k.mobile.trim()
  if (k.whatsapp.trim()) contact.whatsapp = k.whatsapp.trim()

  const p = draft.products
  const products: NonNullable<SupplierRegistrationInput['products']> = {
    productIds: p.productIds,
    proposedProducts: p.proposedProducts,
  }
  if (p.moq.trim()) products.moq = p.moq.trim()
  if (p.productionCapacity.trim()) products.productionCapacity = p.productionCapacity.trim()
  const leadTime = toNumber(p.leadTimeDays)
  if (leadTime !== undefined) products.leadTimeDays = leadTime

  const b = draft.business
  const business: NonNullable<SupplierRegistrationInput['business']> = {
    exportCountries: b.exportCountries,
    shippingPorts: b.shippingPorts,
    languages: b.languages,
  }
  if (b.packaging.trim()) business.packaging = b.packaging.trim()
  if (b.paymentTerms.trim()) business.paymentTerms = b.paymentTerms.trim()
  if (b.containerCapacity.trim()) business.containerCapacity = b.containerCapacity.trim()

  type CertIn = NonNullable<SupplierRegistrationInput['certifications']>[number]
  const certifications = draft.certifications.map((cert) => {
    const out = { type: cert.type as CertIn['type'] } as CertIn
    if (cert.storageKey) out.storageKey = cert.storageKey
    if (cert.fileName) out.fileName = cert.fileName
    if (cert.mimeType) out.mimeType = cert.mimeType as CertIn['mimeType']
    return out
  })

  type DocIn = NonNullable<SupplierRegistrationInput['documents']>[number]
  const documents = draft.documents.map((doc) => {
    const out = { type: doc.type as DocIn['type'], storageKey: doc.storageKey } as DocIn
    if (doc.fileName) out.fileName = doc.fileName
    if (doc.mimeType) out.mimeType = doc.mimeType as DocIn['mimeType']
    return out
  })

  const payload: SupplierRegistrationInput = {
    company,
    contact,
    products,
    certifications,
    documents,
    business,
  }
  if (draft.notes.trim()) payload.notes = draft.notes.trim()
  return payload
}
