export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    </div>
  )
}
