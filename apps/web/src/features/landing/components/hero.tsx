import { Button } from '@triyara/ui'
import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'

import { COMPANY, HERO } from '../content'

/**
 * The first screen a supplier or buyer sees.
 *
 * Both calls to action are above the fold and equally weighted: we do not know
 * which side of the trade a visitor is on, and guessing wrong costs the
 * registration. The supplier button leads because suppliers are the scarcer
 * side of the network.
 *
 * WHY THIS IS TYPOGRAPHIC RATHER THAN PHOTOGRAPHIC: `public/` holds five files,
 * four of them icons. There is no export photography, and inventing some -
 * generated or stock - would put a picture of somebody else's factory behind a
 * claim about ours. So the composition carries itself on type, measure and a
 * single hairline panel, and it is built to accept a real photograph in the
 * right column later without being rebuilt.
 */

/**
 * What verification actually covers.
 *
 * Every line here is drawn from what the business already says on this page:
 * the certifications named in the supplier FAQ, and the expiry-tracking claim
 * in WHY. Nothing is a statistic, a customer, or a badge we do not hold - the
 * panel shows the SHAPE of a verification record, not a fabricated one.
 */
const VERIFIES = [
  // The first row carries no code on purpose. Company registration is not a
  // certification, and writing prose in a column of short codes made the whole
  // list look like it had failed to line up rather than like it had a heading.
  { label: 'Company registration', code: null },
  { label: 'Export licence', code: 'IEC' },
  { label: 'Food safety', code: 'FSSAI' },
  { label: 'Quality systems', code: 'ISO · HACCP' },
  { label: 'Export council', code: 'APEDA' },
] as const

export function Hero() {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-5xl px-gutter py-section-lg lg:py-[4.5rem]">
        {/* 7/5 rather than 6/6. An even split reads as a diagram; the uneven one
            gives the headline the measure it needs and keeps the panel a
            supporting document rather than a competing column. */}
        <div className="grid gap-section lg:grid-cols-12 lg:gap-gutter">
          <div className="lg:col-span-7">
            {/* A rule and a sentence, not a slogan in capitals.
                The uppercase letter-spaced eyebrow above a headline is one of
                the most reliable tells of a generated page - it is styling
                standing in for information. The gold rule does the work of
                marking the start of the composition, and the label underneath
                says what this section is. Gold appears here and nowhere else in
                the hero: it is identity, not decoration. */}
            <div aria-hidden="true" className="h-0.5 w-7 bg-brand" />
            <p className="mt-gap text-base text-content-muted">{HERO.label}</p>

            <h1 className="mt-gap-lg text-balance font-serif text-3xl font-semibold text-content sm:text-display">
              {HERO.headline}
            </h1>

            <p className="mt-gutter max-w-xl text-md leading-relaxed text-content-muted">
              {HERO.body}
            </p>

            <div className="mt-section flex flex-col gap-gap-lg sm:flex-row">
              <Button asChild size="lg" variant="primary" fullWidth className="sm:w-auto">
                <Link href="/register/supplier">
                  {HERO.supplierCta}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" fullWidth className="sm:w-auto">
                <Link href="/register/buyer">{HERO.buyerCta}</Link>
              </Button>
            </div>

            <p className="mt-gutter text-xs text-content-subtle">{HERO.note}</p>
            <p className="mt-section text-2xs uppercase tracking-[0.15em] text-content-subtle">
              {COMPANY.legalName}
            </p>
          </div>

          {/* A document, not a card: one hairline border, no shadow, no radius
              beyond the system's smallest.

              The offset is measured, not nudged: the gold rule (2px), its
              `mt-gap` (8px), the label's line box (22px) and the headline's
              `mt-gap-lg` (16px) sum to 48px, which is `section-lg` exactly - so
              the panel's top rule lands on the headline rather than on an
              arbitrary number. A few pixels either way reads as a mistake; the
              asymmetry that carries this composition is the rule and label
              sitting alone above the panel, and the 7/5 split - not a margin. */}
          <aside
            aria-labelledby="hero-verification"
            className="rounded-sm border border-line lg:col-span-5 lg:mt-section-lg"
          >
            <div className="border-b border-line px-gutter py-gap-lg">
              <h2
                id="hero-verification"
                className="text-2xs font-semibold uppercase tracking-[0.15em] text-content-subtle"
              >
                What verification covers
              </h2>
            </div>

            <ul className="divide-y divide-line">
              {VERIFIES.map((item) => (
                <li
                  key={item.label}
                  className="flex items-baseline justify-between gap-gap px-gutter py-gap-lg"
                >
                  <span className="text-base text-content">{item.label}</span>
                  {item.code ? (
                    <span className="shrink-0 font-mono text-2xs uppercase tracking-wider text-content-subtle">
                      {item.code}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-gap border-t border-line bg-surface-sunken px-gutter py-gap-lg">
              <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <p className="text-xs leading-relaxed text-content-muted">
                Certifications are recorded with expiry dates and re-checked, so an expired
                certificate does not pass as current.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
