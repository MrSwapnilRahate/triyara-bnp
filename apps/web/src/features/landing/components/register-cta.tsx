import { Button } from '@triyara/ui'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { REGISTER } from '../content'

/**
 * The closing ask.
 *
 * Was a solid `bg-navy` slab with everything centred - a fixed colour, so it
 * read as a dark band interrupting a light page and, in dark mode, as a
 * *lighter* slab sitting on the canvas: 1.20:1 against it, the wrong way round.
 * A band bounded by two hairlines does the same job of marking the close
 * without painting a rectangle over the page, and it responds to the theme.
 *
 * Left-aligned, because the rest of the page is. Centring one section is how a
 * page ends up looking assembled from templates rather than written.
 *
 * The supporting line is `HERO.note` by reference. A visitor who scrolled past
 * the hero has forgotten what registering costs them, and telling them again is
 * the honest form of persuasion - no countdown, no scarcity, nothing invented.
 */
export function RegisterCta() {
  return (
    <section aria-labelledby="register" className="border-y border-line bg-surface-sunken">
      <div className="mx-auto max-w-5xl px-gutter py-section-lg">
        <div className="max-w-2xl">
          <h2
            id="register"
            className="text-balance font-serif text-xl font-semibold text-content sm:text-2xl"
          >
            {REGISTER.heading}
          </h2>

          <p className="mt-gap-lg text-md leading-relaxed text-content-muted">{REGISTER.note}</p>

          {/* Equal weight, both above the fold of this section: we still do not
              know which side of the trade the reader is on. */}
          <div className="mt-section flex flex-col gap-gap-lg sm:flex-row">
            <Button asChild size="lg" variant="primary" fullWidth className="sm:w-auto">
              <Link href="/register/supplier">
                {REGISTER.supplierCta}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" fullWidth className="sm:w-auto">
              <Link href="/register/buyer">
                {REGISTER.buyerCta}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
