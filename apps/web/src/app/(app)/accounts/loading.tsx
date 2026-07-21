export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded bg-white/5" />
        ))}
      </div>
    </div>
  )
}
