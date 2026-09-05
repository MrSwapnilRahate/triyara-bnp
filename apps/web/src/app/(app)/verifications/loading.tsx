import { Skeleton, SkeletonTable } from '@triyara/ui'

/** Mirrors the verification queue table so nothing shifts when data lands. */
export default function Loading() {
  return (
    <div>
      <div className="border-b border-line bg-surface px-gutter py-gap-lg">
        <Skeleton className="h-7 w-52" />
      </div>
      <div className="p-gutter">
        <div className="rounded-md border border-line bg-surface">
          <SkeletonTable rows={8} columns={5} />
        </div>
      </div>
    </div>
  )
}
