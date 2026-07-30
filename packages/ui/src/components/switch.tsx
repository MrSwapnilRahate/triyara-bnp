'use client'

import * as SwitchPrimitive from '@radix-ui/react-switch'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'focus-ring peer inline-flex h-5 w-9 shrink-0 items-center rounded-full',
        'duration-fast border-2 border-transparent transition-colors',
        'data-[state=checked]:bg-accent data-[state=unchecked]:bg-line-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'bg-surface pointer-events-none block size-4 rounded-full shadow-sm ring-0',
          'duration-fast transition-transform',
          'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
})
