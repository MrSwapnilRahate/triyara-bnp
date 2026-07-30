import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

import { cn } from '../lib/cn'

const alertVariants = cva('relative flex gap-gap rounded-md border px-gap-lg py-gap-lg text-base', {
  variants: {
    tone: {
      info: 'border-info/30 bg-info-subtle text-info-fg',
      success: 'border-success/30 bg-success-subtle text-success-fg',
      warning: 'border-warning/30 bg-warning-subtle text-warning-fg',
      danger: 'border-danger/30 bg-danger-subtle text-danger-fg',
      neutral: 'border-line bg-surface-sunken text-content',
    },
  },
  defaultVariants: { tone: 'info' },
})

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Info,
} as const

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string
  /** Suppress the leading icon when the surrounding context already carries one. */
  hideIcon?: boolean
  actions?: React.ReactNode
}

/**
 * A persistent, in-flow message. Errors use role="alert" so assistive tech is
 * interrupted; anything calmer stays in the normal reading order.
 */
export function Alert({
  className,
  tone = 'info',
  title,
  hideIcon,
  actions,
  children,
  ...props
}: AlertProps) {
  const Icon = ICONS[tone ?? 'info']
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      {hideIcon ? null : <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-gap-xs')}>{children}</div> : null}
        {actions ? <div className="mt-gap gap-gap flex">{actions}</div> : null}
      </div>
    </div>
  )
}

export { alertVariants }
