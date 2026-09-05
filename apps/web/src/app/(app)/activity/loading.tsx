import { Skeleton } from '@triyara/ui'

/** Mirrors the activity feed's shape so nothing shifts when data lands. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading activity">
      <div className="border-b border-line bg-surface px-gutter py-gap-lg">
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="p-gutter">
        <div className="mx-auto max-w-3xl space-y-gap-xs">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
