import type { SupplierListItem } from '../suppliers/types'

// Response shapes for the matching endpoints (TRY-BNP-SUPPLIER-MATCH).

export interface ScoreComponent {
  key: string
  label: string
  points: number
  max: number
  detail: string
}

export interface SupplierScore {
  supplierId: string
  score: number
  band: 'ready' | 'usable' | 'incomplete'
  components: ScoreComponent[]
  lastContactedAt: string | null
}

/** The shortlist's supplier, which carries the matching scalars and certifications. */
export interface ShortlistSupplier extends SupplierListItem {
  exportCountries: string[]
  packaging: string | null
  paymentTerms: string | null
  moq: string | null
  leadTimeDays: number | null
  productionCapacity: string | null
  certifications: Array<{ id: string; type: string; status: string }>
}

export interface SupplierRfqHistoryItem {
  id: string
  status: string
  invitedAt: string | null
  respondedAt: string | null
  isLate: boolean
  quotationTotal: string | null
  quotationCurrency: string | null
  rfq: {
    id: string
    rfqNumber: string
    title: string
    status: string
    priority: string
    createdAt: string
  }
}

export interface SupplierQuotationHistoryItem {
  id: string
  supplierPrice: string
  supplierCurrency: string
  landedUnitCost: string
  incoterm: string | null
  port: string | null
  rank: number | null
  isSelected: boolean
  createdAt: string
  quotationItem: {
    id: string
    description: string | null
    quotation: {
      id: string
      quotationNumber: string
      status: string
      currency: string
      createdAt: string
    }
  }
}

export interface OpenRfq {
  id: string
  rfqNumber: string
  title: string
  status: string
}

/** Every filter the shortlist accepts, as the panel holds them. */
export interface MatchFilters {
  q: string
  productId: string
  maxMoq: string
  country: string
  exportCountry: string
  packaging: string
  paymentTerms: string
  certification: string
  isVerified: string
  status: string
}

export const EMPTY_FILTERS: MatchFilters = {
  q: '',
  productId: '',
  maxMoq: '',
  country: '',
  exportCountry: '',
  packaging: '',
  paymentTerms: '',
  certification: '',
  isVerified: '',
  status: '',
}

/**
 * Drops the blanks so the request carries only what was actually asked.
 *
 * Sending `certification=''` would be a 422 — the schema takes an enum, not an
 * empty string — so the panel's "any" state has to disappear rather than be
 * transmitted.
 */
export function filtersToQuery(filters: MatchFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value.trim() !== ''),
  ) as Record<string, string>
}

/** How many filters are narrowing the list, for the "clear" affordance. */
export function activeFilterCount(filters: MatchFilters): number {
  return Object.values(filters).filter((v) => v.trim() !== '').length
}
