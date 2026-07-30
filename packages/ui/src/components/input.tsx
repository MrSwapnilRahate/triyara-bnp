'use client'

import { Search, X } from 'lucide-react'
import { forwardRef, useId } from 'react'

import { cn } from '../lib/cn'

const FIELD = cn(
  'focus-ring w-full rounded-sm border border-line bg-surface text-content',
  'placeholder:text-content-subtle',
  'transition-colors duration-fast',
  'hover:border-line-strong',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:hover:border-danger',
)

const SIZES = { sm: 'h-7 px-2 text-xs', md: 'h-8 px-2.5 text-base', lg: 'h-10 px-3 text-md' }

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg'
  invalid?: boolean
  leadingIcon?: React.ReactNode
  trailingSlot?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size = 'md', invalid, leadingIcon, trailingSlot, ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(FIELD, SIZES[size], leadingIcon && 'pl-8', trailingSlot && 'pr-8', className)}
      {...props}
    />
  )
  if (!leadingIcon && !trailingSlot) return field
  return (
    <div className="relative w-full">
      {leadingIcon ? (
        <span
          aria-hidden="true"
          className="text-content-subtle pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 [&_svg]:size-4"
        >
          {leadingIcon}
        </span>
      ) : null}
      {field}
      {trailingSlot ? (
        <span className="absolute top-1/2 right-1.5 -translate-y-1/2">{trailingSlot}</span>
      ) : null}
    </div>
  )
})

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(FIELD, 'resize-y px-2.5 py-2 text-base leading-relaxed', className)}
      {...props}
    />
  )
})

export interface SearchInputProps extends Omit<InputProps, 'leadingIcon' | 'type'> {
  onClear?: () => void
  /** Rendered in a live region so screen readers hear result counts. */
  resultSummary?: string
}

/**
 * Search field with an inline clear affordance. Debouncing is the caller's
 * concern - this component does not decide when a query is "settled", because
 * the right delay differs between a table filter and a command palette.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { onClear, resultSummary, value, className, ...props },
  ref,
) {
  const summaryId = useId()
  const hasValue = value !== undefined && value !== ''
  return (
    <>
      <Input
        ref={ref}
        type="search"
        role="searchbox"
        value={value}
        aria-describedby={resultSummary ? summaryId : undefined}
        leadingIcon={<Search />}
        className={cn('[&::-webkit-search-cancel-button]:appearance-none', className)}
        trailingSlot={
          hasValue && onClear ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search"
              className="focus-ring text-content-subtle hover:text-content rounded-xs p-1"
            >
              <X className="size-3.5" />
            </button>
          ) : undefined
        }
        {...props}
      />
      {resultSummary ? (
        <span id={summaryId} aria-live="polite" className="sr-only">
          {resultSummary}
        </span>
      ) : null}
    </>
  )
})

export { FIELD as fieldClassName }
