import type { Metadata } from 'next'

import { COMPANY, CONTACT } from '@/features/landing/content'

export const metadata: Metadata = {
  title: 'Privacy · Triyara Exports',
}

/**
 * What the platform actually collects and does with it.
 *
 * Written from the system's real behaviour rather than from a template: the
 * fields listed are the ones the registration forms submit, and the retention
 * and sharing statements match how the product works today. It is a factual
 * description, and it needs review by a legal adviser before launch.
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-gutter py-section">
      <h1 className="text-lg font-semibold tracking-tight text-content sm:text-xl">Privacy</h1>
      <p className="mt-gap-lg text-sm text-content-subtle">
        How {COMPANY.legalName} handles the information you give us.
      </p>

      <div className="mt-section space-y-section text-base leading-relaxed text-content-muted">
        <section>
          <h2 className="text-md font-semibold text-content">What we collect</h2>
          <p className="mt-gap-lg">When you register as a supplier or buyer, we collect:</p>
          <ul className="mt-gap-lg list-disc space-y-gap-xs pl-gutter">
            <li>Company details — name, country, city, website and business type.</li>
            <li>Contact details — name, designation, email, phone and WhatsApp number.</li>
            <li>
              Trade information — products, capacity, certifications, destination markets, incoterms
              and payment terms.
            </li>
            <li>
              Documents you upload — company registration, export licences and quality certificates.
            </li>
          </ul>
          <p className="mt-gap-lg">
            We do not ask for payment details, and the registration forms do not create a password
            or an account for you.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Why we collect it</h2>
          <p className="mt-gap-lg">
            To verify that you are a genuine trading business, and to match suppliers with buyer
            requirements. Verification is done by our team reviewing what you submitted.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Who sees it</h2>
          <p className="mt-gap-lg">
            Our sourcing team. When we shortlist a supplier for a buyer requirement, we share the
            supplier details relevant to that enquiry — company, capabilities and certifications. We
            do not sell your information, and we do not publish a public directory.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Where it is stored</h2>
          <p className="mt-gap-lg">
            Records are held in our database and uploaded documents in private object storage;
            neither is publicly accessible. Documents are served only through short-lived links to
            our own team. We send transactional email — registration confirmations and review
            decisions — through a third-party email provider.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">How long we keep it</h2>
          <p className="mt-gap-lg">
            For as long as you are part of the network, and afterwards where we need it for trade,
            tax or export compliance records.
          </p>
        </section>

        <section>
          <h2 className="text-md font-semibold text-content">Your choices</h2>
          <p className="mt-gap-lg">
            Write to{' '}
            <a
              className="focus-ring text-content underline underline-offset-4"
              href={`mailto:${CONTACT.email}`}
            >
              {CONTACT.email}
            </a>{' '}
            to see what we hold about your company, correct it, or ask us to remove it. We will
            confirm what we can remove and what we must retain for compliance.
          </p>
        </section>
      </div>
    </article>
  )
}
