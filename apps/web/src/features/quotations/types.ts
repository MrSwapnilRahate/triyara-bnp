import type { QuotationStatusName } from '@triyara/validation'

/**
 * Response shapes for the Quotation API, from its published openapi.json.
 *
 * Money is a string throughout: Prisma Decimal serialises that way, and parsing
 * it to a float would lose precision on exactly the figures a quotation exists
 * to state. Formatting happens at the edge; the canonical value stays a string.
 *
 * `unitCost` and `marginPercent` are `string | null` rather than optional. The
 * service NULLS them for any caller who cannot `manage Account` - so null means
 * "you may not see this", and the UI must render that absence rather than try
 * to reconstruct the number from anything else.
 */
export type QuotationStatus = QuotationStatusName

export interface QuotationListItem {
  id: string
  quotationNumber: string
  revisionNumber: number
  type: string
  buyerId: string
  primaryRfqId: string | null
  title: string
  currency: string
  baseCurrency: string
  fxRate: string | null
  incoterm: string | null
  destinationCountry: string | null
  destinationPort: string | null
  paymentTermId: string | null
  validFrom: string | null
  validUntil: string | null
  status: QuotationStatus
  subtotal: string | null
  chargesTotal: string | null
  discountTotal: string | null
  taxTotal: string | null
  grandTotal: string | null
  previousRevisionId: string | null
  supersededAt: string | null
  sentAt: string | null
  acceptedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface QuotationItem {
  id: string
  lineNumber: number
  productId: string | null
  customProductName: string | null
  description: string | null
  rfqItemId: string | null
  quantity: string
  unit: string
  /** Null when the caller cannot `manage Account`. Never inferred. */
  unitCost: string | null
  /** Null when the caller cannot `manage Account`. Never inferred. */
  marginPercent: string | null
  unitPrice: string
  lineSubtotal: string
  lineTotal: string
  packaging: string | null
  hsCode: string | null
  countryOfOrigin: string | null
  requiredCertifications: string[]
  leadTimeDays: number | null
  version: number
  product: { id: string; sku: string; name: string } | null
}

export interface QuotationCharge {
  id: string
  quotationItemId: string | null
  type: string
  scope: string
  basis: string
  label: string | null
  rate: string | null
  amount: string
  currency: string
  isDeduction: boolean
  sequence: number
  isVisibleToCustomer: boolean
  version: number
}

export interface QuotationTax {
  id: string
  quotationItemId: string | null
  type: string
  code: string | null
  jurisdiction: string | null
  ratePercent: string
  taxableAmount: string
  amount: string
  currency: string
  isCompound: boolean
  isReverseCharge: boolean
  sequence: number
  version: number
}

export interface Quotation extends QuotationListItem {
  description: string | null
  namedPlace: string | null
  paymentTermsText: string | null
  leadTimeDays: number | null
  packingSummary: string | null
  samplingTerms: string | null
  /** Null when the caller cannot `manage Account`. */
  costTotal: string | null
  /** Null when the caller cannot `manage Account`. */
  marginPercent: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  createdById: string | null
  items: QuotationItem[]
  charges: QuotationCharge[]
  taxes: QuotationTax[]
}

export interface QuotationApproval {
  id: string
  sequence: number
  fromStatus: string | null
  toStatus: string
  approverId: string | null
  thresholdAmount: string | null
  marginPercent: string | null
  comments: string | null
  decidedAt: string | null
}

export interface QuotationRevision {
  id: string
  fromRevision: number | null
  toRevision: number
  reason: string | null
  changeSummary: Record<string, unknown> | null
  changedById: string | null
  changedAt: string
}

/**
 * The quotation state machine, mirrored from quotation.service.ts.
 *
 * The UI holds a copy so it can offer only moves that will succeed - an action
 * certain to return 409 should not be a button. The server stays the authority:
 * this decides what to SHOW, never what is permitted.
 *
 * SUPERSEDED is absent from every value list on purpose: it is reached only
 * through revise(), never by a direct transition.
 */
export const QUOTATION_TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'APPROVED', 'WITHDRAWN'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['SENT', 'DRAFT', 'WITHDRAWN'],
  SENT: ['UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  UNDER_NEGOTIATION: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: ['WITHDRAWN'],
  WITHDRAWN: [],
  SUPERSEDED: [],
}

/** After SENT the document is a commitment: edits must go through a revision. */
export const EDITABLE_STATUSES: readonly QuotationStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
]

export function isEditable(status: QuotationStatus): boolean {
  return EDITABLE_STATUSES.includes(status)
}

export function canMoveTo(status: QuotationStatus, target: QuotationStatus): boolean {
  return QUOTATION_TRANSITIONS[status].includes(target)
}

/**
 * Revising is the only route out of a frozen document, and it is refused once
 * the quotation has already been superseded.
 */
export function canRevise(quotation: Pick<Quotation, 'status' | 'supersededAt'>): boolean {
  if (quotation.supersededAt) return false
  return !isEditable(quotation.status)
}

/** Expired by the clock, whether or not the status has caught up. */
export function isLapsed(quotation: Pick<QuotationListItem, 'validUntil' | 'status'>): boolean {
  if (!quotation.validUntil) return false
  if (['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED'].includes(quotation.status)) {
    return false
  }
  return new Date(quotation.validUntil).getTime() < Date.now()
}

/** True when the caller is allowed to see cost and margin at all. */
export function costVisible(quotation: Pick<Quotation, 'costTotal' | 'marginPercent'>): boolean {
  return quotation.costTotal !== null || quotation.marginPercent !== null
}

export function formatMoney(amount: string | null, currency: string | null): string {
  if (amount === null) return '—'
  const value = Number(amount)
  if (!Number.isFinite(value)) return amount
  return new Intl.NumberFormat(undefined, {
    style: currency ? 'currency' : 'decimal',
    ...(currency ? { currency } : {}),
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatQuantity(quantity: string, unit: string): string {
  const value = Number(quantity)
  const formatted = Number.isFinite(value) ? new Intl.NumberFormat().format(value) : quantity
  return `${formatted} ${unit}`
}

export function formatPercent(value: string | null): string {
  if (value === null) return '—'
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : value
}
