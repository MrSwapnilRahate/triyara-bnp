import type { BuyerRegistrationInput } from '@triyara/validation'

/**
 * What the buyer wizard holds while it is being filled in.
 *
 * All strings and string arrays, for the same reason the supplier draft is: a
 * half-typed value is not yet a valid one, and coercing on every keystroke
 * fights the person typing. Zod coerces once, at submit.
 */
export interface BuyerDraft {
  company: {
    companyName: string
    legalName: string
    businessType: string
    country: string
    city: string
    website: string
    importExperience: string
  }
  contact: {
    name: string
    designation: string
    email: string
    phone: string
    whatsapp: string
  }
  requirement: {
    products: BuyerDraftProduct[]
    annualRequirement: string
    packaging: string
  }
  logistics: {
    destinationCountries: string[]
    destinationPort: string
    incoterms: string[]
    paymentTerms: string[]
    certificationsRequired: string[]
    languages: string[]
  }
  documents: BuyerDraftDocument[]
  notes: string
}

export interface BuyerDraftProduct {
  product: string
  targetVolume: string
  targetPrice: string
  frequency: string
}

export interface BuyerDraftDocument {
  type: string
  storageKey: string
  fileName?: string
  mimeType?: string
}

export const EMPTY_BUYER_PRODUCT: BuyerDraftProduct = {
  product: '',
  targetVolume: '',
  targetPrice: '',
  frequency: '',
}

export const EMPTY_BUYER_DRAFT: BuyerDraft = {
  company: {
    companyName: '',
    legalName: '',
    businessType: '',
    country: '',
    city: '',
    website: '',
    importExperience: '',
  },
  contact: { name: '', designation: '', email: '', phone: '', whatsapp: '' },
  requirement: {
    products: [{ ...EMPTY_BUYER_PRODUCT }],
    annualRequirement: '',
    packaging: '',
  },
  logistics: {
    destinationCountries: [],
    destinationPort: '',
    incoterms: [],
    paymentTerms: [],
    certificationsRequired: [],
    languages: [],
  },
  documents: [],
  notes: '',
}

/**
 * Turns the draft into the API payload.
 *
 * Assembled by mutation rather than by spreading conditionals: `...(x ? {k:v} :
 * {})` produces a union per optional field, which TypeScript multiplies into
 * shapes it then cannot match. The supplier payload builder learned this the
 * same way.
 */
export function buyerDraftToPayload(draft: BuyerDraft): BuyerRegistrationInput {
  const c = draft.company
  const company: BuyerRegistrationInput['company'] = {
    companyName: c.companyName.trim(),
    country: c.country.trim().toUpperCase(),
  }
  if (c.legalName.trim()) company.legalName = c.legalName.trim()
  if (c.businessType) {
    company.businessType = c.businessType as BuyerRegistrationInput['company']['businessType']
  }
  if (c.city.trim()) company.city = c.city.trim()
  if (c.website.trim()) company.website = c.website.trim()
  if (c.importExperience) {
    company.importExperience =
      c.importExperience as BuyerRegistrationInput['company']['importExperience']
  }

  const k = draft.contact
  const contact: BuyerRegistrationInput['contact'] = { name: k.name.trim() }
  if (k.designation.trim()) contact.designation = k.designation.trim()
  if (k.email.trim()) contact.email = k.email.trim()
  if (k.phone.trim()) contact.phone = k.phone.trim()
  if (k.whatsapp.trim()) contact.whatsapp = k.whatsapp.trim()

  type ProductIn = NonNullable<
    NonNullable<BuyerRegistrationInput['requirement']>['products']
  >[number]
  const products = draft.requirement.products
    // A row nobody typed a product name into is an empty row, not a
    // requirement. Sending it would fail validation over a line the buyer
    // never filled in.
    .filter((item) => item.product.trim() !== '')
    .map((item) => {
      const out = { product: item.product.trim() } as ProductIn
      if (item.targetVolume.trim()) out.targetVolume = item.targetVolume.trim()
      if (item.targetPrice.trim()) out.targetPrice = item.targetPrice.trim()
      if (item.frequency.trim()) out.frequency = item.frequency.trim()
      return out
    })

  const requirement: NonNullable<BuyerRegistrationInput['requirement']> = { products }
  if (draft.requirement.annualRequirement.trim()) {
    requirement.annualRequirement = draft.requirement.annualRequirement.trim()
  }
  if (draft.requirement.packaging.trim()) {
    requirement.packaging = draft.requirement.packaging.trim()
  }

  const l = draft.logistics
  const logistics: NonNullable<BuyerRegistrationInput['logistics']> = {
    destinationCountries: l.destinationCountries,
    incoterms: l.incoterms,
    paymentTerms: l.paymentTerms,
    certificationsRequired: l.certificationsRequired,
    languages: l.languages,
  }
  if (l.destinationPort.trim()) logistics.destinationPort = l.destinationPort.trim()

  type DocIn = NonNullable<BuyerRegistrationInput['documents']>[number]
  const documents = draft.documents.map((doc) => {
    const out = { type: doc.type as DocIn['type'], storageKey: doc.storageKey } as DocIn
    if (doc.fileName) out.fileName = doc.fileName
    if (doc.mimeType) out.mimeType = doc.mimeType as DocIn['mimeType']
    return out
  })

  const payload: BuyerRegistrationInput = {
    company,
    contact,
    requirement,
    logistics,
    documents,
  }
  if (draft.notes.trim()) payload.notes = draft.notes.trim()
  return payload
}
