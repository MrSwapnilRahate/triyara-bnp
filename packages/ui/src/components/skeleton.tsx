import { cn } from '../lib/cn'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Match the final content's shape so nothing shifts when data arrives. */
  variant?: 'text' | 'block' | 'circle'
}

export function Skeleton({ className, variant = 'block', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-surface-sunken relative overflow-hidden',
        variant === 'text' && 'h-3 rounded-xs',
        variant === 'block' && 'rounded-sm',
        variant === 'circle' && 'rounded-full',
        'after:animate-shimmer after:absolute after:inset-0 after:-translate-x-full',
        'after:via-content/5 after:bg-gradient-to-r after:from-transparent after:to-transparent',
        className,
      )}
      {...props}
    />
  )
}

/** Table-shaped placeholder. Rows match --row-height so density is honoured. */
export function SkeletonTable({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading results" className="w-full">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="gap-gap-lg border-line px-gap-lg flex items-center border-b"
          style={{ height: 'var(--row-height)' }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} variant="text" className={c === 0 ? 'w-1/4' : 'w-1/6'} />
          ))}
        </div>
      ))}
    </div>
  )
}
