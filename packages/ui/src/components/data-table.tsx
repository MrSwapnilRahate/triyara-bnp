import { cn } from '../lib/cn'

/**
 * Layout shell for a server-driven table. It owns chrome only - toolbar, header,
 * scroll container, footer - and knows nothing about columns, sorting or data.
 * The table engine (TanStack Table) and the query live in the feature layer, so
 * this shell never grows a data dependency.
 */
export interface DataTableLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Search, filters, column visibility, density. */
  toolbar?: React.ReactNode
  /** Bulk-selection bar, shown in place of the toolbar when rows are selected. */
  selectionBar?: React.ReactNode
  /** Pagination controls. */
  footer?: React.ReactNode
  /** Rendered instead of children for empty, filtered-empty and error states. */
  state?: React.ReactNode
}

export function DataTableLayout({
  toolbar,
  selectionBar,
  footer,
  state,
  className,
  children,
  ...props
}: DataTableLayoutProps) {
  return (
    <div
      className={cn('border-line bg-surface flex min-h-0 flex-col rounded-md border', className)}
      {...props}
    >
      {(selectionBar ?? toolbar) ? (
        <div className="gap-gap border-line px-gap-lg py-gap flex min-h-12 flex-wrap items-center border-b">
          {selectionBar ?? toolbar}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">{state ?? children}</div>

      {footer ? (
        <div className="gap-gap border-line px-gap-lg py-gap flex flex-wrap items-center justify-between border-t">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

/** Semantic table with sticky header. Real table markup, for screen readers. */
export function DataTable({
  caption,
  className,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { caption?: string }) {
  return (
    <table className={cn('w-full border-collapse text-left', className)} {...props}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      {children}
    </table>
  )
}

export function DataTableHead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('z-raised bg-surface-sunken sticky top-0', className)} {...props} />
}

export function DataTableHeaderCell({
  className,
  sortable,
  sortDirection,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  sortable?: boolean
  sortDirection?: 'asc' | 'desc' | null
}) {
  return (
    <th
      scope="col"
      aria-sort={
        sortable
          ? sortDirection === 'asc'
            ? 'ascending'
            : sortDirection === 'desc'
              ? 'descending'
              : 'none'
          : undefined
      }
      className={cn(
        'border-line px-gap-lg py-gap text-content-muted border-b text-xs font-semibold whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

export function DataTableRow({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'border-line border-b last:border-b-0',
        interactive && 'duration-instant hover:bg-surface-sunken cursor-pointer transition-colors',
        className,
      )}
      style={{ height: 'var(--row-height)' }}
      {...props}
    />
  )
}

export function DataTableCell({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'px-gap-lg text-content py-0 text-sm',
        numeric && 'text-right font-mono tabular-nums',
        className,
      )}
      {...props}
    />
  )
}
