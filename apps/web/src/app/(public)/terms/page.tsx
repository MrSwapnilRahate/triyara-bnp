import type { Metadata } from 'next'

import { COMPANY, CONTACT } from '@/features/landing/content'

export const metadata: Metadata = {
  title: 'Terms · Triyara Exports',
}

/**
 * The terms of using the network, stated as the product actually works.
 *
 * Deliberately short and concrete. Needs review by a legal adviser before
 * launch — this describes the arrangement accurately, it is not legal advice.
 */
export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-gutter py-section">
      <h1 className="text-lg font-semibold tracking-tight text-content sm:text-xl">Terms</h1>
      <p className="mt-gap-lg text-sm text-content-subtle">
        The basis on which {COMPANY.legalName} operates the TRIYARA Business Network.
      </p>

      <div className="mt-section space-y-section text-base leading-relaxed text-content-muted">
        <section>
          <h2 className="text-md font-semibold text-content">What registration means</h2>
          <p className="mt-gap-lg">
            Registering asks us to consider you for the network. It does not create an account, and
            it does not guarantee acceptance — every registration is reviewed, and we may decline
            one without giving a detailed reason.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Accurate information</h2>
          <p className="mt-gap-lg">
            You confirm that the company details, capabilities and certificates you submit are true
            and yours to submit. Submitting a certificate that is expired, altered or belongs to
            another company is grounds for removal from the network.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">What verification means</h2>
          <p className="mt-gap-lg">
            Verification means our team has reviewed the documents you gave us at that time. It is
            not a guarantee of quality, capacity or performance on any particular order, and it does
            not replace your own due diligence on a counterparty.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Our role in a trade</h2>
          <p className="mt-gap-lg">
            We introduce, shortlist and coordinate. The contract of sale for any goods is between
            the buyer and the supplier unless we have separately agreed otherwise in writing.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Costs</h2>
          <p className="mt-gap-lg">
            Registering and submitting a requirement is free. Any commission or service fee is
            agreed in writing before an order proceeds.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Leaving</h2>
          <p className="mt-gap-lg">
            Write to{' '}
            <a
              className="focus-ring text-content underline underline-offset-4"
              href={`mailto:${CONTACT.email}`}
            >
              {CONTACT.email}
            </a>{' '}
            and we will remove you from the network. We may also remove a supplier or buyer who
            misrepresents themselves or acts against the interests of a counterparty.
          </p>
        </section>
      </div>
    </article>
  )
}
