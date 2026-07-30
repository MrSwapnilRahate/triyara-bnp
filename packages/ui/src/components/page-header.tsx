import { cn } from '../lib/cn'

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: string
  /** Business identifier, rendered monospace so codes are scannable. */
  identifier?: string
  description?: string
  /** Status badge, revision indicator - anything that qualifies the title. */
  status?: React.ReactNode
  /** Breadcrumb trail, rendered above the title. */
  breadcrumb?: React.ReactNode
  /** Primary and secondary actions, right-aligned. */
  actions?: React.ReactNode
  /** Key/value metadata strip below the title. */
  meta?: Array<{ label: string; value: React.ReactNode }>
  /** Tab bar, rendered flush with the header's bottom border. */
  tabs?: React.ReactNode
}

/**
 * The standard top of every screen. Consistent placement matters more than
 * flexibility here: an approver should never hunt for the Approve button because
 * one screen put it somewhere else.
 */
export function PageHeader({
  title,
  identifier,
  description,
  status,
  breadcrumb,
  actions,
  meta,
  tabs,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn('border-line bg-surface px-gutter pt-gap-lg border-b', className)}
      {...props}
    >
      {breadcrumb ? <div className="mb-gap">{breadcrumb}</div> : null}

      <div className="gap-gap-lg flex flex-wrap items-start justify-between">
        <div className="min-w-0">
          <div className="gap-gap flex flex-wrap items-center">
            <h1 className="text-content truncate text-xl font-semibold tracking-tight">{title}</h1>
            {identifier ? (
              <span className="bg-surface-sunken text-content-muted rounded-sm px-1.5 py-0.5 font-mono text-xs">
                {identifier}
              </span>
            ) : null}
            {status}
          </div>
          {description ? (
            <p className="mt-gap-xs text-content-muted max-w-2xl text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="gap-gap flex shrink-0 items-center">{actions}</div> : null}
      </div>

      {meta && meta.length > 0 ? (
        <dl className="mt-gap-lg gap-x-section gap-y-gap flex flex-wrap">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-2xs text-content-subtle tracking-wide uppercase">{m.label}</dt>
              <dd className="text-content mt-0.5 truncate text-base">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={cn(tabs ? 'mt-gap-lg' : 'h-gap-lg')}>{tabs}</div>
    </header>
  )
}
