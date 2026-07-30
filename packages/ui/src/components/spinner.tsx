'use client'

import { cn } from '../lib/cn'

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Announced to assistive technology. Set to null inside an already-labelled control. */
  label?: string | null
}

const SIZES = { xs: 'h-3 w-3', sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' }

export function Spinner({ size = 'md', label = 'Loading', className, ...props }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-current', SIZES[size], className)}
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      {...props}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export interface LoadingOverlayProps {
  /** When false the overlay is not rendered at all. */
  visible: boolean
  message?: string
  /** Cover the nearest positioned ancestor rather than the viewport. */
  contained?: boolean
  className?: string
}

/**
 * Blocks interaction while something completes. Used for full-screen route
 * transitions and for panels mid-mutation. It is NOT the loading state for a
 * first paint - that is a Skeleton, which does not block.
 */
export function LoadingOverlay({ visible, message, contained, className }: LoadingOverlayProps) {
  if (!visible) return null
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'z-overlay bg-canvas/70 flex items-center justify-center backdrop-blur-sm',
        contained ? 'absolute inset-0' : 'fixed inset-0',
        className,
      )}
    >
      <div className="gap-gap flex flex-col items-center">
        <Spinner size="lg" label={null} className="text-accent" />
        {message ? <p className="text-content-muted text-sm">{message}</p> : null}
        <span className="sr-only">{message ?? 'Loading'}</span>
      </div>
    </div>
  )
}
