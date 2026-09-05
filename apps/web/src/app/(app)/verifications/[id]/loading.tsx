import { Skeleton } from '@triyara/ui'

/** Mirrors the verification detail cards so nothing shifts when data lands. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading verification">
      <div className="gap-gap border-b border-line bg-surface px-gutter py-gap-lg">
        <Skeleton className="h-7 w-64" />
      </div>
      <div className="mx-auto flex max-w-4xl flex-col gap-gutter p-gutter">
        {[20, 40, 32, 28].map((h, i) => (
          <Skeleton key={i} className="rounded-md" style={{ height: `${h * 4}px` }} />
        ))}
      </div>
    </div>
  )
}
