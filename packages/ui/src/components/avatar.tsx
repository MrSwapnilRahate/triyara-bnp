'use client'

import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { forwardRef } from 'react'

import { cn } from '../lib/cn'

const SIZES = {
  xs: 'size-5 text-2xs',
  sm: 'size-6 text-2xs',
  md: 'size-8 text-xs',
  lg: 'size-10 text-base',
}

export interface AvatarProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  size?: keyof typeof SIZES
  src?: string
  /** Used for the alt text and to derive initials. */
  name: string
}

/** Initials from a display name: "Priya Raman" -> "PR", "Triyara" -> "T". */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

export const Avatar = forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  function Avatar({ className, size = 'md', src, name, ...props }, ref) {
    return (
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(
          'bg-surface-sunken relative flex shrink-0 overflow-hidden rounded-full',
          SIZES[size],
          className,
        )}
        {...props}
      >
        {src ? (
          <AvatarPrimitive.Image
            src={src}
            alt={name}
            className="aspect-square size-full object-cover"
          />
        ) : null}
        <AvatarPrimitive.Fallback
          delayMs={src ? 300 : 0}
          className="text-content-muted flex size-full items-center justify-center font-medium"
        >
          <span aria-hidden="true">{initialsFrom(name)}</span>
          <span className="sr-only">{name}</span>
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
    )
  },
)
