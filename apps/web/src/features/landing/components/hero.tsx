import { Button } from '@triyara/ui'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { COMPANY, HERO } from '../content'

/**
 * The first screen a supplier or buyer sees.
 *
 * Both calls to action are above the fold and equally weighted: we do not know
 * which side of the trade a visitor is on, and guessing wrong costs the
 * registration. The supplier button leads because suppliers are the scarcer
 * side of the network.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy-deep">
      {/* Depth without imagery: a gold wash anchored top-right, which reads as
          brand rather than decoration and costs no network request. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-1/4 -top-1/2 size-[40rem] rounded-full bg-gold/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-5xl px-gutter py-section-lg sm:py-[6rem]">
        <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-gold">
          {HERO.eyebrow}
        </p>
        <h1 className="mt-gap-lg max-w-3xl text-[2rem] font-bold leading-[1.15] tracking-tight text-white sm:text-[2.75rem]">
          {HERO.headline}
        </h1>
        <p className="mt-gutter max-w-2xl text-base leading-relaxed text-white/70 sm:text-md">
          {HERO.body}
        </p>

        <div className="mt-section flex flex-col gap-gap-lg sm:flex-row">
          <Button asChild size="lg" variant="primary" className="sm:w-auto" fullWidth>
            <Link href="/register/supplier">
              {HERO.supplierCta}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            fullWidth
            className="border-white/20 bg-white/5 text-white hover:bg-white/10 active:bg-white/10 sm:w-auto"
          >
            <Link href="/register/buyer">{HERO.buyerCta}</Link>
          </Button>
        </div>

        <p className="mt-gutter text-xs text-white/50">{HERO.note}</p>
        <p className="mt-section-lg text-2xs uppercase tracking-[0.15em] text-white/30">
          {COMPANY.legalName}
        </p>
      </div>
    </section>
  )
}
