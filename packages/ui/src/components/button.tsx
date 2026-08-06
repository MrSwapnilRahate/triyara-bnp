'use client'

import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'
import { Spinner } from './spinner'

const buttonVariants = cva(
  cn(
    'focus-ring inline-flex select-none items-center justify-center gap-gap whitespace-nowrap',
    'rounded-sm font-medium transition-colors duration-fast',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'border border-line bg-surface text-content hover:bg-surface-sunken active:bg-surface-sunken',
        ghost: 'text-content-muted hover:bg-surface-sunken hover:text-content',
        danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2 text-xs [&_svg]:size-3.5',
        md: 'h-8 px-3 text-base [&_svg]:size-4',
        lg: 'h-10 px-4 text-md [&_svg]:size-4',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', fullWidth: false },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render as the child element (Next Link, anchor) keeping button styling. */
  asChild?: boolean
  /** Shows a spinner and disables the button. The label stays, so width is stable. */
  loading?: boolean
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    asChild,
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="xs" label={null} /> : leadingIcon}
      {/* Slottable tells Radix which child is the slot target. Without it,
          asChild throws as soon as the button also renders an icon. */}
      <Slottable>{children}</Slottable>
      {loading ? null : trailingIcon}
    </Comp>
  )
})

export interface IconButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'fullWidth'> {
  /** Required: an icon-only control has no visible text to name it. */
  label: string
  asChild?: boolean
  loading?: boolean
}

const ICON_SIZES = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10' }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = 'ghost', size = 'md', label, asChild, loading, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant, size }), 'p-0', ICON_SIZES[size ?? 'md'], className)}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="xs" label={null} /> : children}
    </Comp>
  )
})

export { buttonVariants }
