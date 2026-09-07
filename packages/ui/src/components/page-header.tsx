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
 *
 * WHERE THE PRODUCT SAYS WHOSE IT IS. Measured across sixteen rendered
 * authenticated states, the application used the display face zero times and the
 * brand gold zero times, while the public site and the sign-in screens had both.
 * The two surfaces read as different companies. This component is where that is
 * cheapest to correct: one gold rule and one serif title reach every screen that
 * already uses it, and nothing else on any page changes.
 *
 * Restrained on purpose. The title stays at the application's own `xl`, not the
 * marketing `display` tier - a page header is a label on a working screen, not a
 * headline - and the gold is a 28px rule, the same mark the hero and the auth
 * card open on. Everything below the title stays in Inter, because a serif on a
 * field label is a costume.
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

      {/* Identity, not decoration: gold marks who this is and appears nowhere
          else on the screen. Decorative, so it is hidden from assistive
          technology - it carries no information a heading does not. */}
      <div aria-hidden="true" className="bg-brand h-0.5 w-7" />

      <div className="gap-gap-lg mt-gap flex flex-wrap items-start justify-between">
        <div className="min-w-0">
          <div className="gap-gap flex flex-wrap items-center">
            <h1 className="text-content truncate font-serif text-xl font-semibold">{title}</h1>
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
