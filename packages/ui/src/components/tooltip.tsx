'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'

/** Mount once near the app root; nested providers reset the shared delay. */
export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-tooltip bg-content text-content-inverted max-w-xs rounded-sm px-2 py-1 text-xs shadow-md',
          'data-[state=delayed-open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})

export interface InfoTipProps {
  /** Tooltips are supplementary. Never put information here that is required. */
  content: React.ReactNode
  children: React.ReactNode
}

export function InfoTip({ content, children }: InfoTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  )
}
