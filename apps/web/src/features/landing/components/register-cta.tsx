import { Button } from '@triyara/ui'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

/**
 * The closing ask.
 *
 * Buttons only, as specified — someone who has read this far has the context
 * and needs a target, not another paragraph.
 */
export function RegisterCta() {
  return (
    <section aria-labelledby="register" className="bg-navy py-section-lg">
      <div className="mx-auto max-w-3xl px-gutter text-center">
        <h2 id="register" className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          Join the network
        </h2>
        <div className="mt-section flex flex-col justify-center gap-gap-lg sm:flex-row">
          <Button asChild size="lg" variant="primary" fullWidth className="sm:w-auto">
            <Link href="/register/supplier">
              Become a Supplier
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
            <Link href="/register/buyer">
              Become a Buyer
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
