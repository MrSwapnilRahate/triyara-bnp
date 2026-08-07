import { BadgeCheck, FileCheck2, Globe2, ShieldCheck, Timer, UserCheck } from 'lucide-react'

import { WHY } from '../content'

// Icons live here rather than in content.ts: copy is business-owned, icon
// choice is presentation. Order matches WHY exactly.
const ICONS = [BadgeCheck, UserCheck, Timer, ShieldCheck, FileCheck2, Globe2] as const

export function Why() {
  return (
    <section aria-labelledby="why-triyara" className="bg-surface-sunken py-section-lg">
      <div className="mx-auto max-w-5xl px-gutter">
        <h2
          id="why-triyara"
          className="text-lg font-semibold tracking-tight text-content sm:text-xl"
        >
          Why TRIYARA
        </h2>
        <ul className="mt-section grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((item, index) => {
            const Icon = ICONS[index] ?? BadgeCheck
            return (
              <li
                key={item.title}
                className="rounded-md border border-line bg-surface p-gutter transition-colors hover:border-accent/40"
              >
                <Icon className="size-5 text-accent" aria-hidden="true" strokeWidth={1.5} />
                <h3 className="mt-gap-lg text-base font-semibold text-content">{item.title}</h3>
                <p className="mt-gap-xs text-sm leading-relaxed text-content-muted">{item.body}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
