'use client'

import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

const SIZES = { sm: 'h-7 text-xs', md: 'h-8 text-base', lg: 'h-10 text-md' }

export const SelectTrigger = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    size?: keyof typeof SIZES
    invalid?: boolean
  }
>(function SelectTrigger({ className, size = 'md', invalid, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'focus-ring gap-gap border-line flex w-full items-center justify-between rounded-sm border',
        'bg-surface text-content duration-fast px-2.5 transition-colors',
        'hover:border-line-strong',
        'data-[placeholder]:text-content-subtle',
        'disabled:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60',
        'aria-[invalid=true]:border-danger',
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="text-content-subtle size-4 shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})

export const SelectContent = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, position = 'popper', children, ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          'z-popover border-line max-h-72 min-w-[8rem] overflow-hidden rounded-md border',
          'bg-surface-overlay shadow-overlay',
          'data-[state=open]:animate-zoom-in',
          position === 'popper' && 'data-[side=bottom]:translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="text-content-subtle flex h-6 items-center justify-center">
          <ChevronUp className="size-3.5" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="text-content-subtle flex h-6 items-center justify-center">
          <ChevronDown className="size-3.5" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})

export const SelectItem = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default items-center rounded-sm py-1.5 pr-2 pl-7 text-base select-none',
        'duration-instant transition-colors outline-none',
        'focus:bg-surface-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="text-accent size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
})

export const SelectLabel = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        'text-2xs text-content-subtle px-2 py-1.5 font-semibold tracking-wide uppercase',
        className,
      )}
      {...props}
    />
  )
})

export const SelectSeparator = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('bg-line -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
})

/**
 * A real `<select>`, styled to match `SelectTrigger`.
 *
 * WHY THIS EXISTS ALONGSIDE THE RADIX SELECT: the Radix one is the default and
 * the better control - it is searchable, it portals, and its listbox is styled.
 * But it renders its native element visually hidden and `aria-hidden`, purely so
 * a surrounding form serialises. Anything that has to *drive* the element rather
 * than read it - `page.selectOption` in a browser test, an autofill heuristic, a
 * screen reader on a platform that prefers the OS picker - needs the real thing,
 * visible and focusable.
 *
 * Use `SelectTrigger` by default. Reach for this when a native element is part
 * of the contract, and note which one at the call site.
 *
 * `appearance-none` plus an explicit chevron rather than the platform arrow, so
 * the two selects are indistinguishable on screen.
 */
export const NativeSelect = forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
    size?: keyof typeof SIZES
    invalid?: boolean
  }
>(function NativeSelect({ className, size = 'md', invalid, children, ...props }, ref) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'focus-ring border-line flex w-full appearance-none items-center rounded-sm border',
          'bg-surface text-content duration-fast py-0 pr-8 pl-2.5 transition-colors',
          'hover:border-line-strong',
          'disabled:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60',
          'aria-[invalid=true]:border-danger',
          SIZES[size],
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-content-subtle pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
      />
    </div>
  )
})
