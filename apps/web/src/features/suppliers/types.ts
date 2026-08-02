/**
 * Response shapes for the Supplier API, from its published openapi.json.
 *
 * Bank account numbers are absent by construction: the repository's projection
 * omits `accountNumber`, so it never reaches the wire. The type reflects that -
 * a field that cannot arrive should not be declared optional, or a screen will
 * eventually try to render it.
 */
export type SupplierStatus =
  'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'INACTIVE'

export interface SupplierListItem {
  id: string
  supplierCode: string
  companyName: string
  legalName: string
  businessType: string
  email: string | null
  phone: string | null
  country: string | null
  state: string | null
  city: string | null
  status: SupplierStatus
  isVerified: boolean
  verifiedAt: string | null
  accountId: string | null
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface SupplierCertification {
  id: string
  type: string
  certificateNumber: string | null
  issuedBy: string | null
  issuedDate: string | null
  expiryDate: string | null
  status: string
  scope: string | null
}

export interface Supplier extends SupplierListItem {
  website: string | null
  gstNumber: string | null
  iecNumber: string | null
  panNumber: string | null
  contacts: Array<{
    id: string
    name: string
    role: string
    designation: string | null
    email: string | null
    phone: string | null
    isPrimary: boolean
  }>
  addresses: Array<{
    id: string
    type: string
    line1: string
    city: string | null
    state: string | null
    postalCode: string | null
    country: string | null
    isPrimary: boolean
  }>
  /** Metadata only. accountNumber is never selected by the API. */
  bankAccounts: Array<{
    id: string
    bankName: string
    branchName: string | null
    accountHolderName: string
    ifscCode: string | null
    swiftCode: string | null
    currency: string
    isPrimary: boolean
    isVerified: boolean
  }>
  certifications: SupplierCertification[]
  tags: Array<{ tagId: string; tag: { id: string; name: string; slug: string } }>
}

/** Compact projection from GET /search. Carries no contact or banking data. */
export interface SupplierSearchHit {
  id: string
  supplierCode: string
  companyName: string
  country: string | null
  city: string | null
  status: SupplierStatus
  isVerified: boolean
}

export interface CountryFacet {
  country: string
  suppliers: number
}

export interface CertificationFacet {
  type: string
  total: number
  active: number
}

export interface SupplierOffering {
  id: string
  supplierId: string
  productId: string
  supplierSku: string | null
  moq: string | null
  moqUnit: string | null
  leadTimeDays: number | null
  isPreferred: boolean
  price: string | null
  currency: string | null
  incoterm: string | null
  port: string | null
  validFrom: string | null
  validTo: string | null
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED'
  version: number
  product?: { id: string; sku: string; name: string } | null
}

/** Certifications lapsing within 30 days, for the detail-page warning. */
export function expiringSoon(certifications: SupplierCertification[], days = 30): number {
  const threshold = Date.now() + days * 86_400_000
  return certifications.filter((c) => {
    if (!c.expiryDate || c.status !== 'ACTIVE') return false
    const expiry = new Date(c.expiryDate).getTime()
    return expiry <= threshold
  }).length
}

export function isExpired(certification: SupplierCertification): boolean {
  if (!certification.expiryDate) return false
  return new Date(certification.expiryDate).getTime() < Date.now()
}

/** A row of GET /api/suppliers/:id/documents. */
export interface SupplierDocumentRow {
  id: string
  supplierId: string
  type: string
  title: string | null
  storageKey: string | null
  mimeType: string | null
  fileSize: number | null
  checksum: string | null
  documentNumber: string | null
  issuedDate: string | null
  expiryDate: string | null
  documentId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

/**
 * A row of GET /api/suppliers/:id/certifications.
 *
 * Richer than the embedded `Supplier.certifications` projection: this is what
 * the tab edits, so it carries `scope`, `status` and the `version` an edit
 * needs.
 */
export interface SupplierCertificationRow {
  id: string
  supplierId: string
  type: string
  certificateNumber: string
  issuedBy: string | null
  issuedDate: string | null
  expiryDate: string | null
  status: string
  scope: string | null
  supplierDocumentId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

/**
 * A row of GET /api/suppliers/:id/contacts.
 *
 * Richer than the embedded `Supplier.contacts` projection, which the detail
 * response trims for display. This is what the contacts tab edits, so it
 * carries `whatsapp`, `notes` and the `version` an edit needs.
 */
export interface SupplierContact {
  id: string
  supplierId: string
  name: string
  role: string
  designation: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  isPrimary: boolean
  sortOrder: number
  notes: string | null
  version: number
  createdAt: string
  updatedAt: string
}
