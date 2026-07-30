import type { RFQStatusName } from '@triyara/validation'

/**
 * Response shapes for the RFQ API, from its published openapi.json.
 *
 * Money arrives as a string, not a number: Prisma Decimal serialises that way,
 * and parsing it to a float here would quietly lose precision on exactly the
 * values a sourcing team cares about. Formatting happens at the edge.
 */
export type RfqStatus = RFQStatusName

export type RfqSupplierStatus =
  'INVITED' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'SUBMITTED' | 'NO_RESPONSE' | 'WITHDRAWN'

export interface RfqListItem {
  id: string
  rfqNumber: string
  type: 'BUYER' | 'INTERNAL'
  buyerId: string | null
  title: string
  currency: string | null
  incoterm: string | null
  destinationCountry: string | null
  destinationPort: string | null
  expectedShipmentDate: string | null
  quotationDeadline: string | null
  status: RfqStatus
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  currentRevision: number
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface RfqItem {
  id: string
  lineNumber: number
  productId: string | null
  customProductName: string | null
  customProductDescription: string | null
  quantity: string
  unit: string
  targetPrice: string | null
  targetCurrency: string | null
  specifications: Record<string, unknown> | null
  requiredCertifications: string[]
  packaging: string | null
  remarks: string | null
  version: number
  product: { id: string; sku: string; name: string } | null
}

export interface RfqParticipation {
  id: string
  supplierId: string
  status: RfqSupplierStatus
  invitedAt: string | null
  viewedAt: string | null
  respondedAt: string | null
  submittedAt: string | null
  isLate: boolean
  quotationCurrency: string | null
  quotationIncoterm: string | null
  quotationPort: string | null
  quotationValidUntil: string | null
  quotationTotal: string | null
  version: number
  supplier: {
    id: string
    supplierCode: string
    companyName: string
    status: string
  } | null
}

export interface Rfq extends RfqListItem {
  description: string | null
  createdById: string | null
  items: RfqItem[]
  suppliers: RfqParticipation[]
}

export interface RfqResponse {
  id: string
  rfqSupplierId: string
  rfqItemId: string
  revisionNumber: number
  isCurrent: boolean
  price: string
  currency: string
  moq: string | null
  moqUnit: string | null
  leadTimeDays: number | null
  incoterm: string | null
  port: string | null
  offeredProductId: string | null
  offeredDescription: string | null
  remarks: string | null
  validUntil: string | null
  submittedAt: string | null
  version: number
}

export interface RfqApproval {
  id: string
  sequence: number
  fromStatus: string | null
  toStatus: string
  approverId: string | null
  comments: string | null
  decidedAt: string | null
}

export interface RfqRevision {
  id: string
  revisionNumber: number
  reason: string | null
  snapshot: Record<string, unknown> | null
  changedById: string | null
  changedAt: string
}

/**
 * The sourcing state machine, mirrored from rfq.service.ts.
 *
 * The UI holds a copy so it can offer only the moves that will succeed - an
 * action that is certain to return 409 should not be a button. The server
 * remains the authority: this decides what to *show*, never what is allowed.
 */
export const RFQ_TRANSITIONS: Record<RfqStatus, readonly RfqStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['ISSUED', 'CANCELLED'],
  ISSUED: ['IN_PROGRESS', 'EXPIRED', 'CANCELLED'],
  IN_PROGRESS: ['EVALUATING', 'EXPIRED', 'CANCELLED'],
  EVALUATING: ['AWARDED', 'CLOSED', 'CANCELLED'],
  AWARDED: ['CLOSED'],
  EXPIRED: ['CLOSED', 'DRAFT'],
  CLOSED: [],
  CANCELLED: ['DRAFT'],
}

/** Commercial terms freeze once the RFQ is out with suppliers. */
export const TERMS_FROZEN_IN: readonly RfqStatus[] = [
  'ISSUED',
  'IN_PROGRESS',
  'EVALUATING',
  'AWARDED',
  'CLOSED',
]

/** Lines can no longer be revised once the outcome is settled. */
export const LINES_FROZEN_IN: readonly RfqStatus[] = ['AWARDED', 'CLOSED', 'CANCELLED']

export function canPublish(rfq: Pick<Rfq, 'status' | 'suppliers'>): boolean {
  return rfq.status === 'APPROVED' && rfq.suppliers.length > 0
}

export function canClose(status: RfqStatus): boolean {
  return RFQ_TRANSITIONS[status].includes('CLOSED')
}

export function canReopen(status: RfqStatus): boolean {
  return RFQ_TRANSITIONS[status].includes('DRAFT')
}

/** Deadline has passed and the RFQ is still waiting on bids. */
export function isOverdue(rfq: Pick<RfqListItem, 'quotationDeadline' | 'status'>): boolean {
  if (!rfq.quotationDeadline) return false
  if (['AWARDED', 'CLOSED', 'CANCELLED'].includes(rfq.status)) return false
  return new Date(rfq.quotationDeadline).getTime() < Date.now()
}

/**
 * Money as it arrived, with its currency - never re-parsed.
 *
 * Intl.NumberFormat takes the string through Number only for display; the
 * canonical value stays the string the API sent.
 */
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
