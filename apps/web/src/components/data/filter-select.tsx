'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@triyara/ui'

export interface FilterOption {
  value: string
  label: string
  /** Rendered after the label, e.g. a facet count. */
  hint?: string | number
}

export interface FilterSelectProps {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  options: FilterOption[]
  /** Label for the "no filter" choice. */
  allLabel?: string
  className?: string
}

/** Sentinel for "no filter". Radix Select cannot take an empty-string value. */
const ALL = '__all__'

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
  className,
}: FilterSelectProps) {
  return (
    <>
      <span className="sr-only" id={`filter-${label}`}>
        {label}
      </span>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : next)}
      >
        <SelectTrigger size="sm" aria-labelledby={`filter-${label}`} className={className}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
              {option.hint !== undefined ? (
                <span className="ml-gap text-content-subtle">{option.hint}</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
