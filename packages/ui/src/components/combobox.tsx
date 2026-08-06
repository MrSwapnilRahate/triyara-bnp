'use client'

import { Command as CommandPrimitive } from 'cmdk'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'

import { cn } from '../lib/cn'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Spinner } from './spinner'

export interface ComboboxOption {
  value: string
  label: string
  /** Second line: a code, a country, anything that disambiguates duplicates. */
  hint?: string
  disabled?: boolean
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  invalid?: boolean
  loading?: boolean
  /**
   * Provide to filter server-side. When set, the component stops filtering
   * locally - the caller owns which options are shown, so a remote search cannot
   * be double-filtered into an empty list.
   */
  onSearchChange?: (query: string) => void
  clearable?: boolean
  className?: string
  id?: string
  'aria-labelledby'?: string
}

/**
 * Single-select typeahead. Distinct from Select: this is for sets too large to
 * scroll (suppliers, products) and supports asynchronous option loading.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches.',
  disabled,
  invalid,
  loading,
  onSearchChange,
  clearable = true,
  className,
  id,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value])
  const remote = Boolean(onSearchChange)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            'focus-ring gap-gap border-line flex h-8 w-full items-center justify-between rounded-sm border',
            'bg-surface text-content duration-fast px-2.5 text-base transition-colors',
            'hover:border-line-strong',
            'disabled:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60',
            'aria-[invalid=true]:border-danger',
            className,
          )}
          {...aria}
        >
          <span className={cn('truncate', !selected && 'text-content-subtle')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown aria-hidden="true" className="text-content-subtle size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <CommandPrimitive shouldFilter={!remote} loop>
          <div className="border-line flex items-center border-b px-2.5">
            <CommandPrimitive.Input
              value={query}
              onValueChange={(q) => {
                setQuery(q)
                onSearchChange?.(q)
              }}
              placeholder={searchPlaceholder}
              className="text-content placeholder:text-content-subtle h-8 w-full bg-transparent text-base outline-none"
            />
            {loading ? <Spinner size="xs" label={null} className="text-content-subtle" /> : null}
          </div>
          <CommandPrimitive.List className="max-h-60 overflow-y-auto p-1">
            {loading ? null : (
              <CommandPrimitive.Empty className="text-content-muted px-2 py-6 text-center text-base">
                {emptyMessage}
              </CommandPrimitive.Empty>
            )}
            {clearable && selected ? (
              <CommandPrimitive.Item
                value="__clear__"
                onSelect={() => {
                  onValueChange(null)
                  setOpen(false)
                }}
                className="text-content-muted data-[selected=true]:bg-surface-sunken flex cursor-default items-center rounded-sm px-2 py-1.5 text-base select-none"
              >
                Clear selection
              </CommandPrimitive.Item>
            ) : null}
            {options.map((option) => (
              <CommandPrimitive.Item
                key={option.value}
                value={`${option.label} ${option.hint ?? ''} ${option.value}`}
                disabled={option.disabled}
                onSelect={() => {
                  onValueChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'gap-gap flex cursor-default items-start rounded-sm px-2 py-1.5 text-base select-none',
                  'data-[selected=true]:bg-surface-sunken data-[disabled=true]:opacity-50',
                )}
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    'text-accent mt-0.5 size-3.5 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0">
                  <span className="text-content block truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="text-content-subtle block truncate text-xs">
                      {option.hint}
                    </span>
                  ) : null}
                </span>
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  )
}
