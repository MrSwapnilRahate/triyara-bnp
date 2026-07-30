export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-deep px-6 text-center">
      <h1 className="text-3xl font-bold text-gold">Triyara Business Network Platform</h1>
      <p className="max-w-md text-sm text-white/60">
        Repository scaffold <code className="text-gold/80">TRY-BNP-BOOT-01</code> is running. No
        business modules yet &mdash; the production-grade foundation only.
      </p>
      <a href="/api/health" className="text-xs text-white/40 underline">
        /api/health
      </a>
    </main>
  )
}
