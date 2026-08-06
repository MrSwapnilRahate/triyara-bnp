import { cn } from '@triyara/ui'
import Link from 'next/link'

export interface BrandProps {
  /** Render the wordmark alongside the glyph. */
  showWordmark?: boolean
  href?: string
  className?: string
}

/** The lockup. One definition, used by the sidebar and the auth layout. */
export function Brand({ showWordmark = true, href = '/dashboard', className }: BrandProps) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-accent text-2xs font-bold text-accent-fg"
      >
        T
      </span>
      {showWordmark ? (
        <span className="truncate text-base font-semibold tracking-tight text-content">
          Triyara <span className="text-content-muted">BNP</span>
        </span>
      ) : null}
      {showWordmark ? null : <span className="sr-only">Triyara BNP</span>}
    </>
  )

  if (!href) {
    return <span className={cn('flex items-center gap-gap', className)}>{inner}</span>
  }

  return (
    <Link href={href} className={cn('focus-ring flex items-center gap-gap rounded-sm', className)}>
      {inner}
    </Link>
  )
}
