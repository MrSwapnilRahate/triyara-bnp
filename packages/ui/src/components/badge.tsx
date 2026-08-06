'use client'

import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-gap-xs rounded-sm font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-subtle text-neutral-fg',
        accent: 'bg-accent-subtle text-accent',
        success: 'bg-success-subtle text-success-fg',
        warning: 'bg-warning-subtle text-warning-fg',
        danger: 'bg-danger-subtle text-danger-fg',
        info: 'bg-info-subtle text-info-fg',
      },
      variant: { soft: '', outline: 'border bg-transparent' },
      size: { sm: 'h-4 px-1.5 text-2xs', md: 'h-5 px-2 text-xs' },
    },
    compoundVariants: [
      { variant: 'outline', tone: 'neutral', class: 'border-line-strong text-content-muted' },
      { variant: 'outline', tone: 'accent', class: 'border-accent text-accent' },
      { variant: 'outline', tone: 'success', class: 'border-success text-success-fg' },
      { variant: 'outline', tone: 'warning', class: 'border-warning text-warning-fg' },
      { variant: 'outline', tone: 'danger', class: 'border-danger text-danger-fg' },
      { variant: 'outline', tone: 'info', class: 'border-info text-info-fg' },
    ],
    defaultVariants: { tone: 'neutral', variant: 'soft', size: 'md' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Small leading dot. Never the ONLY signal - the label always carries the meaning. */
  dot?: boolean
}

export function Badge({ className, tone, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, variant, size }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full',
            tone === 'success' && 'bg-success',
            tone === 'warning' && 'bg-warning',
            tone === 'danger' && 'bg-danger',
            tone === 'info' && 'bg-info',
            tone === 'accent' && 'bg-accent',
            (!tone || tone === 'neutral') && 'bg-neutral',
          )}
        />
      ) : null}
      {children}
    </span>
  )
}

export type StatusTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

/**
 * The single mapping from a domain status to a visual tone.
 *
 * Every workflow status across every module resolves here, which is what stops
 * the same status rendering three different colours on three screens. Feature
 * modules extend the map; they never inline a colour decision.
 */
export const STATUS_TONE: Record<string, StatusTone> = {
  // Neutral / draft
  DRAFT: 'neutral',
  INACTIVE: 'neutral',
  CLOSED: 'neutral',
  SUPERSEDED: 'neutral',
  WITHDRAWN: 'neutral',
  NO_RESPONSE: 'neutral',
  DISCONTINUED: 'neutral',

  // In flight
  PENDING_APPROVAL: 'warning',
  PENDING_REVIEW: 'warning',
  PENDING: 'warning',
  UNDER_NEGOTIATION: 'warning',
  IN_PROGRESS: 'info',
  EVALUATING: 'info',
  ISSUED: 'info',
  SENT: 'info',
  INVITED: 'info',
  VIEWED: 'info',
  SUBMITTED: 'info',

  // Settled, good
  APPROVED: 'success',
  ACCEPTED: 'success',
  AWARDED: 'success',
  ACTIVE: 'success',
  VERIFIED: 'success',

  // Settled, bad
  REJECTED: 'danger',
  BLOCKED: 'danger',
  CANCELLED: 'danger',
  DECLINED: 'danger',
  EXPIRED: 'danger',
}

export interface StatusBadgeProps extends Omit<BadgeProps, 'tone' | 'children'> {
  status: string
  /** Override the label; defaults to the humanised status. */
  label?: string
}

/** Humanises SCREAMING_SNAKE into Title Case: PENDING_APPROVAL -> Pending approval. */
export function humaniseStatus(status: string): string {
  const lower = status.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function StatusBadge({ status, label, ...props }: StatusBadgeProps) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot {...props}>
      {label ?? humaniseStatus(status)}
    </Badge>
  )
}

export { badgeVariants }
