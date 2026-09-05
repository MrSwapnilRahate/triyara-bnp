import { Skeleton, SkeletonTable } from '@triyara/ui'

/** Mirrors the accounts table so nothing shifts when data lands. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading accounts">
      <div className="border-b border-line bg-surface px-gutter py-gap-lg">
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="p-gutter">
        <div className="rounded-md border border-line bg-surface">
          <SkeletonTable rows={8} columns={7} />
        </div>
      </div>
    </div>
  )
}
