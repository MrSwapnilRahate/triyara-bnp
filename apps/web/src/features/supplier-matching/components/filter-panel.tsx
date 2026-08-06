'use client'

import {
  Badge,
  Button,
  Input,
  Label,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@triyara/ui'
import { CERTIFICATION_TYPES, SUPPLIER_STATUSES } from '@triyara/validation'
import { X } from 'lucide-react'
import { useState } from 'react'

import { useProducts } from '../../catalog/api/products'
import { useSupplierCountries } from '../../suppliers/api/suppliers'
import { activeFilterCount, EMPTY_FILTERS, type MatchFilters } from '../types'

/** Radix Select cannot hold an empty value, so "any" needs a sentinel. */
const ANY = '__any__'

const humanise = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')

/**
 * The filter panel (TRY-BNP-SUPPLIER-MATCH).
 *
 * Every control maps to one parameter the shortlist endpoint already accepts —
 * nothing is filtered in the browser. A client-side filter would silently lie
 * on the second page, because it can only narrow what happened to be fetched.
 */
export function FilterPanel({
  filters,
  onChange,
  resultCount,
}: {
  filters: MatchFilters
  onChange: (next: MatchFilters) => void
  resultCount: number | null
}) {
  const countries = useSupplierCountries()
  const set = <K extends keyof MatchFilters>(key: K, value: string) =>
    onChange({ ...filters, [key]: value })

  const active = activeFilterCount(filters)

  return (
    <div className="space-y-gutter">
      <div className="flex items-center justify-between gap-gap">
        <h2 className="text-sm font-medium text-content">
          Filters
          {active > 0 ? (
            <Badge tone="accent" size="sm" className="ml-gap">
              {active}
            </Badge>
          ) : null}
        </h2>
        {active > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<X />}
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Clear
          </Button>
        ) : null}
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-q">Search</Label>
        <SearchInput
          id="match-q"
          value={filters.q}
          placeholder="Company, code or city"
          onChange={(event) => set('q', event.target.value)}
          onClear={() => set('q', '')}
          {...(resultCount === null
            ? {}
            : { resultSummary: `${resultCount} supplier${resultCount === 1 ? '' : 's'} match` })}
        />
      </div>

      <ProductFilter value={filters.productId} onChange={(id) => set('productId', id)} />

      <div className="space-y-gap-xs">
        <Label htmlFor="match-moq">Maximum MOQ</Label>
        <p className="text-2xs text-content-muted">
          Matches the offering for the chosen product, not the company&apos;s stated minimum.
        </p>
        <Input
          id="match-moq"
          inputMode="decimal"
          placeholder="e.g. 10"
          value={filters.maxMoq}
          onChange={(event) => set('maxMoq', event.target.value.replace(/[^0-9.]/g, ''))}
        />
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-country">Country</Label>
        <Select
          value={filters.country || ANY}
          onValueChange={(value) => set('country', value === ANY ? '' : value)}
        >
          <SelectTrigger id="match-country">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any country</SelectItem>
            {(countries.data ?? []).map((facet) => (
              <SelectItem key={facet.country} value={facet.country}>
                {facet.country} ({facet.suppliers})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-export">Exports to</Label>
        <Input
          id="match-export"
          maxLength={2}
          placeholder="AE"
          value={filters.exportCountry}
          onChange={(event) => set('exportCountry', event.target.value.toUpperCase())}
        />
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-certification">Certification</Label>
        <Select
          value={filters.certification || ANY}
          onValueChange={(value) => set('certification', value === ANY ? '' : value)}
        >
          <SelectTrigger id="match-certification">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any certification</SelectItem>
            {CERTIFICATION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-packaging">Packaging</Label>
        <Input
          id="match-packaging"
          placeholder="e.g. PP bags"
          value={filters.packaging}
          onChange={(event) => set('packaging', event.target.value)}
        />
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-terms">Payment terms</Label>
        <Input
          id="match-terms"
          placeholder="e.g. advance"
          value={filters.paymentTerms}
          onChange={(event) => set('paymentTerms', event.target.value)}
        />
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-verified">Verification</Label>
        <Select
          value={filters.isVerified || ANY}
          onValueChange={(value) => set('isVerified', value === ANY ? '' : value)}
        >
          <SelectTrigger id="match-verified">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            <SelectItem value="true">Verified only</SelectItem>
            <SelectItem value="false">Not verified</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-gap-xs">
        <Label htmlFor="match-status">Status</Label>
        <Select
          value={filters.status || ANY}
          onValueChange={(value) => set('status', value === ANY ? '' : value)}
        >
          <SelectTrigger id="match-status">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {SUPPLIER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {humanise(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/**
 * A typeahead over the catalog, not a dropdown: the product list is unbounded,
 * and a select of every product would be unusable long before it was wrong.
 *
 * Searches through the catalog's own `useProducts`, so it finds exactly what
 * the products screen finds and cannot drift from it.
 */
function ProductFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (productId: string) => void
}) {
  const [term, setTerm] = useState('')
  const trimmed = term.trim()

  // From two characters, matching the API's own minimum. Firing a request the
  // server will reject is pure noise.
  const products = useProducts(trimmed.length >= 2 ? { q: trimmed, limit: 8 } : { limit: 0 })
  const options = trimmed.length >= 2 ? (products.data?.items ?? []) : []

  const selected = value ? options.find((p) => p.id === value) : undefined

  return (
    <div className="space-y-gap-xs">
      <Label htmlFor="match-product">Product</Label>
      <p className="text-2xs text-content-muted">
        Narrows to suppliers who actually offer it — and pairs with the MOQ below.
      </p>

      {value ? (
        <div className="flex items-center justify-between gap-gap rounded-sm border border-line bg-surface px-2.5 py-1.5">
          <span className="truncate text-xs text-content">{selected?.name ?? value}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Clear product filter"
            onClick={() => {
              onChange('')
              setTerm('')
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <SearchInput
            id="match-product"
            value={term}
            placeholder="Turmeric, pepper…"
            onChange={(event) => setTerm(event.target.value)}
            onClear={() => setTerm('')}
          />
          {options.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto rounded-sm border border-line" role="listbox">
              {options.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => onChange(product.id)}
                    className="focus-ring block w-full px-2.5 py-1.5 text-left text-xs text-content hover:bg-surface-sunken"
                  >
                    {product.name}
                    <span className="ml-gap-xs font-mono text-2xs text-content-muted">
                      {product.sku}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  )
}
