import { Skeleton } from '@triyara/ui'

export default function Loading() {
  return (
    <div className="p-gutter">
      <div className="mx-auto max-w-3xl space-y-gap-lg">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}
