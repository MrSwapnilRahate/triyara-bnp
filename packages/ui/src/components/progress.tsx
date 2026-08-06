'use client'

import * as ProgressPrimitive from '@radix-ui/react-progress'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'

export interface ProgressProps extends React.ComponentPropsWithoutRef<
  typeof ProgressPrimitive.Root
> {
  /** Null renders an indeterminate bar. */
  value?: number | null
  tone?: 'accent' | 'success' | 'danger'
  label?: string
}

export const Progress = forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  function Progress({ className, value, tone = 'accent', label, ...props }, ref) {
    const indeterminate = value === null || value === undefined
    return (
      <ProgressPrimitive.Root
        ref={ref}
        value={indeterminate ? undefined : value}
        aria-label={label}
        className={cn(
          'bg-surface-sunken relative h-1.5 w-full overflow-hidden rounded-full',
          className,
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            'duration-slow h-full w-full flex-1 transition-transform',
            tone === 'accent' && 'bg-accent',
            tone === 'success' && 'bg-success',
            tone === 'danger' && 'bg-danger',
            indeterminate && 'animate-shimmer',
          )}
          style={indeterminate ? undefined : { transform: `translateX(-${100 - (value ?? 0)}%)` }}
        />
      </ProgressPrimitive.Root>
    )
  },
)
