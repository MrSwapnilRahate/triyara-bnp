'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'
import { IconButton } from './button'

/**
 * Side panel. Built on Radix Dialog so focus trapping, escape handling and the
 * accessible name come for free - a hand-rolled drawer is where keyboard users
 * get stranded.
 */
export const Drawer = DialogPrimitive.Root
export const DrawerTrigger = DialogPrimitive.Trigger
export const DrawerClose = DialogPrimitive.Close
export const DrawerTitle = DialogPrimitive.Title
export const DrawerDescription = DialogPrimitive.Description

const WIDTHS = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' }

export const DrawerContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: 'right' | 'left'
    width?: keyof typeof WIDTHS
    hideClose?: boolean
  }
>(function DrawerContent(
  { className, side = 'right', width = 'md', hideClose, children, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'z-overlay bg-content/40 fixed inset-0',
          'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'z-drawer border-line bg-surface shadow-overlay fixed inset-y-0 flex w-full flex-col',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
          WIDTHS[width],
          className,
        )}
        {...props}
      >
        {hideClose ? null : (
          <DialogPrimitive.Close asChild>
            <IconButton label="Close panel" size="sm" className="absolute top-3 right-3">
              <X />
            </IconButton>
          </DialogPrimitive.Close>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-line px-gutter pb-gap-lg pr-section pt-gutter border-b', className)}
      {...props}
    />
  )
}

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-gutter py-gap-lg flex-1 overflow-y-auto', className)} {...props} />
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('gap-gap border-line px-gutter py-gap-lg flex justify-end border-t', className)}
      {...props}
    />
  )
}
