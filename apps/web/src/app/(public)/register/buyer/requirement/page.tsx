import { Card } from '@triyara/ui'
import { ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'

import { CONTACT } from '@/features/landing/content'

export const metadata: Metadata = {
  title: 'Your requirement · Triyara Exports',
}

/**
 * Where a newly registered buyer lands after asking to submit a requirement.
 *
 * There is no public requirement intake: RFQs are raised by the sourcing team
 * against an authenticated session, and buyers have no account. Rather than
 * invent an endpoint, this says plainly what happens next and gives them a way
 * to send the detail now, which is what a buyer in a hurry actually wants.
 */
export default function BuyerRequirementPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-gutter py-section">
      <Card className="w-full">
        <ClipboardList
          className="mx-auto size-10 text-accent"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <h1 className="mt-gap-lg text-center text-md font-semibold tracking-tight text-content">
          Tell us what you need
        </h1>
        <div className="mt-gap space-y-gap-lg text-base leading-relaxed text-content-muted">
          <p>
            Your registration is with our sourcing team. They will contact you shortly to take your
            requirement in detail — product, volume, specifications, certifications and delivery
            terms.
          </p>
          <p>
            If you would rather not wait, send the details straight to us and we will start
            shortlisting suppliers today.
          </p>
        </div>
        <div className="mt-gutter rounded-md border border-line bg-surface-sunken p-gutter">
          <p className="text-2xs font-semibold uppercase tracking-[0.15em] text-content-subtle">
            Email your requirement
          </p>
          <a
            className="focus-ring mt-gap-xs inline-block text-base text-content underline-offset-4 hover:underline"
            href={`mailto:${CONTACT.email}?subject=${encodeURIComponent('New sourcing requirement')}`}
          >
            {CONTACT.email}
          </a>
        </div>
      </Card>
      <p className="mt-gutter text-2xs text-content-subtle">Triyara Exports LLP</p>
    </div>
  )
}
