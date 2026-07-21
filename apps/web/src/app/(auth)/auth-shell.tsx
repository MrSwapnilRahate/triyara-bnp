import type { ReactNode } from 'react'

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="bg-navy-elevated/60 w-full max-w-sm rounded-2xl border border-white/10 p-8">
        <h1 className="text-gold text-xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-white/50">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}

export const inputClass =
  'w-full rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gold/60 focus:outline-none'
export const buttonClass =
  'w-full rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50'
