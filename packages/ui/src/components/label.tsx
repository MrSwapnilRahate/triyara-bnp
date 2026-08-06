'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'

export interface LabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  required?: boolean
}

export const Label = forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  function Label({ className, required, children, ...props }, ref) {
    return (
      <LabelPrimitive.Root
        ref={ref}
        className={cn('text-content-muted text-xs font-medium peer-disabled:opacity-60', className)}
        {...props}
      >
        {children}
        {required ? (
          <span className="ml-gap-xs text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </LabelPrimitive.Root>
    )
  },
)
