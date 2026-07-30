import { cn } from '../lib/cn'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  /**
   * `filtered` is a genuinely different state from `empty` and must read
   * differently: "no results for this filter" is recoverable, "nothing here yet"
   * is an invitation to create something.
   */
  variant?: 'empty' | 'filtered' | 'error'
  size?: 'sm' | 'md'
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'empty',
  size = 'md',
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'px-gutter py-section-lg' : 'px-gap-lg py-section',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            'mb-gap-lg flex items-center justify-center rounded-full',
            size === 'md' ? 'size-12' : 'size-10',
            variant === 'error'
              ? 'bg-danger-subtle text-danger'
              : 'bg-surface-sunken text-content-subtle',
            '[&_svg]:size-5',
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className={cn('text-content font-semibold', size === 'md' ? 'text-md' : 'text-base')}>
        {title}
      </p>
      {description ? (
        <p className="mt-gap-xs text-content-muted max-w-sm text-base">{description}</p>
      ) : null}
      {action ? <div className="mt-gap-lg gap-gap flex">{action}</div> : null}
    </div>
  )
}
