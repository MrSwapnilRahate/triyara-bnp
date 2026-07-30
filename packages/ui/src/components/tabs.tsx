'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'

export const Tabs = TabsPrimitive.Root

export const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('gap-gap-lg border-line flex items-center overflow-x-auto border-b', className)}
      {...props}
    />
  )
})

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { count?: number }
>(function TabsTrigger({ className, count, children, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'focus-ring gap-gap -mb-px inline-flex items-center border-b-2 border-transparent whitespace-nowrap',
        'text-content-muted px-1 pt-2 pb-2.5 text-base font-medium',
        'duration-fast hover:text-content transition-colors',
        'data-[state=active]:border-accent data-[state=active]:text-content',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="bg-surface-sunken text-2xs text-content-muted rounded-sm px-1.5 py-0.5 tabular-nums">
          {count}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  )
})

export const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content ref={ref} className={cn('focus-ring pt-gap-lg', className)} {...props} />
  )
})
