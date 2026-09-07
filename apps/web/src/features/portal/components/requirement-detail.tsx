import type { BuyerRequirementDetail } from '@triyara/core'
import { Badge, EmptyState, PageHeader } from '@triyara/ui'
import Link from 'next/link'

/**
 * One requirement, in full.
 *
 * Presentational: it takes the detail the service built and nothing else. What
 * is absent is the other half of the transaction - no supplier, no award, no
 * quotation, no internal note - because TRIYARA sits between the two sides and
 * a screen is where that quietly stops being true.
 *
 * Read-only by construction. There is no control here to cancel, edit or chase a
 * requirement: those are conversations with a TRIYARA contact, not buttons.
 *
 * Set as one document rather than a stack of cards. The two sections below are
 * parts of the same record, and giving each its own bordered box said they were
 * separate things that happened to be on the same page.
 */
export function RequirementDetail({ requirement }: { requirement: BuyerRequirementDetail }) {
  const r = requirement

  return (
    <>
      <PageHeader
        // The title is whatever the buyer called their requirement, so it must
        // wrap rather than be cut off. `PageHeader` truncates by default, which
        // is right for a staff screen listing our own record names and wrong
        // for a name somebody else wrote.
        className="-mx-gutter mb-section [&_h1]:overflow-visible [&_h1]:whitespace-normal"
        title={r.title}
        identifier={r.rfqNumber}
        status={
          <>
            <Badge>{humanise(r.status)}</Badge>
            <Badge>{humanise(r.priority)} priority</Badge>
          </>
        }
        breadcrumb={
          <Link
            href="/portal/requirements"
            className="focus-ring inline-flex min-h-6 items-center text-sm text-content-muted hover:text-content"
          >
            &larr; All requirements
          </Link>
        }
      />

      <section aria-labelledby="requirement-commercial">
        <h2 id="requirement-commercial" className="text-md font-semibold text-content">
          Commercial and shipment
        </h2>
        <dl className="mt-gap-lg flex flex-wrap gap-x-section gap-y-gap-lg">
          <Field label="Raised">{formatDate(r.createdAt)}</Field>
          {r.quotationDeadline ? (
            <Field label="Quotes needed by">{formatDate(r.quotationDeadline)}</Field>
          ) : null}
          {r.expectedShipmentDate ? (
            <Field label="Expected shipment">{formatDate(r.expectedShipmentDate)}</Field>
          ) : null}
          {r.destinationCountry ? (
            <Field label="Destination">
              {[r.destinationPort, r.destinationCountry].filter(Boolean).join(', ')}
            </Field>
          ) : null}
          {r.incoterm ? <Field label="Incoterm">{r.incoterm}</Field> : null}
          {r.currency ? <Field label="Currency">{r.currency}</Field> : null}
        </dl>
      </section>

      <section
        aria-labelledby="requirement-lines"
        className="mt-section border-t border-line pt-section"
      >
        <h2 id="requirement-lines" className="text-md font-semibold text-content">
          What you asked us to source
        </h2>
        {r.items.length === 0 ? (
          <div className="mt-gap-lg">
            <EmptyState
              title="No lines recorded"
              description="Your TRIYARA contact can add the detail of what you need."
            />
          </div>
        ) : (
          <ul className="mt-gap-lg divide-y divide-line">
            {r.items.map((item) => (
              <li key={item.lineNumber} className="py-gap-lg first:pt-0">
                <p className="font-medium text-content">{item.productName ?? 'Unnamed line'}</p>
                <dl className="mt-gap flex flex-wrap gap-x-section gap-y-gap-lg">
                  <Field label="Quantity">
                    {item.quantity} {item.unit}
                  </Field>
                  {item.packaging ? <Field label="Packaging">{item.packaging}</Field> : null}
                  {item.requiredCertifications.length > 0 ? (
                    <Field label="Certifications required">
                      {item.requiredCertifications.map(humanise).join(', ')}
                    </Field>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-section text-sm text-content-muted">
        Your TRIYARA contact is handling the sourcing for this requirement.
      </p>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm text-content-muted">{label}</dt>
      <dd className="text-base font-medium text-content">{children}</dd>
    </div>
  )
}

/** `PENDING_APPROVAL` reads badly to somebody who does not work here. */
function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(value)
}
