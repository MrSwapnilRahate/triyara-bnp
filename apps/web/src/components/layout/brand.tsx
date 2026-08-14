import { cn } from '@triyara/ui'
import Image from 'next/image'
import Link from 'next/link'

export interface BrandProps {
  /** Render the wordmark alongside the glyph. */
  showWordmark?: boolean
  href?: string
  /**
   * `sm` is the navigation chrome, where the glyph shares a 56px row with the
   * wordmark. `lg` is the signed-out pages, where the lockup is the only thing
   * on screen and can carry more weight.
   */
  size?: 'sm' | 'lg'
  className?: string
}

/**
 * The lockup. One definition, used by the sidebar, the mobile drawer and the
 * auth layout, so the mark cannot drift between them.
 *
 * The glyph is the emblem from the official TRIYARA EXPORTS logo - the globe
 * with its plane, ship and swooshes - and not the full lockup. The official
 * artwork stacks that emblem above the TRIYARA / EXPORTS wordmark, which at
 * these sizes would render the words as an illegible smudge; the emblem alone
 * is the part that still reads at 24px. The words are still present, set in the
 * product's own type as "Triyara BNP", which also keeps the platform
 * distinguishable from the public site.
 *
 * Transparent PNG rather than a tinted or recoloured copy: the mark is gold on
 * navy by design and sits on the dark surface unaltered.
 */
export function Brand({
  showWordmark = true,
  href = '/dashboard',
  size = 'sm',
  className,
}: BrandProps) {
  const px = size === 'lg' ? 40 : 24

  const inner = (
    <>
      <Image
        src="/triyara-mark.png"
        alt=""
        aria-hidden="true"
        width={px}
        height={px}
        priority
        // Explicit width and height on a square asset: the box is reserved
        // before the bytes arrive, so the row cannot shift as it loads.
        className="shrink-0"
        style={{ width: px, height: px }}
      />
      {showWordmark ? (
        <span
          className={cn(
            'truncate font-semibold tracking-tight text-content',
            size === 'lg' ? 'text-lg' : 'text-base',
          )}
        >
          Triyara <span className="text-content-muted">BNP</span>
        </span>
      ) : (
        <span className="sr-only">Triyara BNP</span>
      )}
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
