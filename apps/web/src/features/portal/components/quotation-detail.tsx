import type { BuyerQuotationDetailView } from '@triyara/core'
import { Badge, EmptyState, PageHeader, Separator } from '@triyara/ui'
import Link from 'next/link'

/**
 * One offer, in full.
 *
 * Presentational: it takes the detail the service built and nothing else. Every
 * number on this page is a component of what we quoted THEM - the lines, the
 * charges we chose to show broken out, the tax, the total. What is absent is
 * what the offer cost us to assemble: no supplier, no sourced cost, no landed
 * cost, no margin, because TRIYARA sits between the two sides and a screen is
 * where that quietly stops being true.
 *
 * Read-only by construction. There is no control here to accept, reject or
 * negotiate an offer: those are conversations with a TRIYARA contact, not
 * buttons.
 *
 * Set as one document. The three sections were three bordered boxes, which made
 * the lines, the price and the terms read as three records rather than three
 * parts of one offer.
 */
export function QuotationDetail({ quotation }: { quotation: BuyerQuotationDetailView }) {
  const q = quotation

  // The price components, in the order they are shown, with the ones we do not
  // hold already removed. Gathered before rendering so the rule above the total
  // can be drawn only when there is something above it to rule off - with a
  // sparsely priced offer it was drawing a line under nothing.
  const components: Array<{ key: string; label: string; value: string; negative: boolean }> = []
  const push = (key: string, label: string, value: string | null, negative = false) => {
    if (value === null || Number(value) === 0) return
    components.push({ key, label, value, negative })
  }

  push('subtotal', 'Subtotal', q.subtotal)
  q.charges.forEach((charge, index) => {
    push(
      `${charge.type}-${index}`,
      charge.label ?? humanise(charge.type),
      charge.amount,
      charge.isDeduction,
    )
  })
  // Only when nothing was broken out line by line: otherwise the same money
  // would be presented twice.
  if (q.charges.length === 0) {
    push('charges', 'Charges', q.chargesTotal)
    push('discount', 'Discount', q.discountTotal, true)
  }
  push('tax', 'Tax', q.taxTotal)

  return (
    <>
      <PageHeader
        // The title is the buyer's own requirement wording where we carried it
        // through, so it wraps rather than being cut off.
        className="-mx-gutter mb-section [&_h1]:overflow-visible [&_h1]:whitespace-normal"
        title={q.title ?? `Quotation ${q.quotationNumber}`}
        // Only when the offer has a title of its own. Without one the heading
        // is already `Quotation <number>`, and the chip would print the number
        // a second time three centimetres to its right.
        identifier={q.title ? q.quotationNumber : undefined}
        status={
          <>
            <span className="text-sm text-content-muted">revision {q.revisionNumber}</span>
            <Badge>{humanise(q.status)}</Badge>
            <Badge>{humanise(q.type)} offer</Badge>
          </>
        }
        breadcrumb={
          <Link
            href="/portal/quotations"
            className="focus-ring inline-flex min-h-6 items-center text-sm text-content-muted hover:text-content"
          >
            &larr; All quotations
          </Link>
        }
      />

      <section aria-labelledby="quotation-lines">
        <h2 id="quotation-lines" className="text-md font-semibold text-content">
          What we quoted
        </h2>
        {q.lines.length === 0 ? (
          <div className="mt-gap-lg">
            <EmptyState
              title="No lines recorded"
              description="Your TRIYARA contact can talk you through what this offer covers."
            />
          </div>
        ) : (
          <ul className="mt-gap-lg divide-y divide-line">
            {q.lines.map((line) => (
              <li key={line.lineNumber} className="py-gap-lg first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-gap">
                  <p className="font-medium text-content">{line.productName ?? 'Unnamed line'}</p>
                  <p className="font-medium tabular-nums text-content">
                    {formatMoney(line.lineSubtotal, q.currency)}
                  </p>
                </div>
                <dl className="mt-gap flex flex-wrap gap-x-section gap-y-gap-lg">
                  <Field label="Quantity">
                    {line.quantity} {line.unit}
                  </Field>
                  <Field label="Unit price">{formatMoney(line.unitPrice, q.currency)}</Field>
                  {line.leadTimeDays !== null ? (
                    <Field label="Lead time">{line.leadTimeDays} days</Field>
                  ) : null}
                  {line.packaging ? <Field label="Packaging">{line.packaging}</Field> : null}
                  {line.countryOfOrigin ? (
                    <Field label="Origin">{line.countryOfOrigin}</Field>
                  ) : null}
                  {line.hsCode ? (
                    <Field label="HS code">
                      <span className="font-mono">{line.hsCode}</span>
                    </Field>
                  ) : null}
                  {line.requiredCertifications.length > 0 ? (
                    <Field label="Certifications">
                      {line.requiredCertifications.map(humanise).join(', ')}
                    </Field>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="quotation-price"
        className="mt-section border-t border-line pt-section"
      >
        <h2 id="quotation-price" className="text-md font-semibold text-content">
          The price
        </h2>
        {/* The components are shown so the total can be checked rather than
            taken on trust. They are all our price to the buyer; what the
            goods cost us is not on this page and is never fetched. */}
        <div className="ml-auto mt-gap-lg max-w-sm">
          {components.length > 0 ? (
            <dl className="space-y-2">
              {components.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between">
                  <dt className="text-sm text-content-muted">{c.label}</dt>
                  <dd className="text-sm tabular-nums text-content">
                    {c.negative ? '−' : ''}
                    {formatMoney(c.value, q.currency)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* Outside the list above, and its own list below. A `dl` may hold
              only dt/dd groups, and a wrapper that pairs nothing is a
              violation - so the rule separates two lists rather than sitting
              inside one. Drawn only when there is a list above it. */}
          {components.length > 0 ? <Separator className="my-3" /> : null}

          <dl className="flex items-baseline justify-between">
            <dt className="font-medium text-content">Total</dt>
            <dd className="text-lg font-semibold tabular-nums text-content">
              {q.grandTotal ? formatMoney(q.grandTotal, q.currency) : 'Pricing in progress'}
            </dd>
          </dl>
        </div>
      </section>

      <section
        aria-labelledby="quotation-terms"
        className="mt-section border-t border-line pt-section"
      >
        <h2 id="quotation-terms" className="text-md font-semibold text-content">
          Terms and shipment
        </h2>
        <dl className="mt-gap-lg flex flex-wrap gap-x-section gap-y-gap-lg">
          {q.sentAt ? <Field label="Sent">{formatDate(q.sentAt)}</Field> : null}
          {q.validFrom ? <Field label="Valid from">{formatDate(q.validFrom)}</Field> : null}
          {q.validUntil ? <Field label="Valid until">{formatDate(q.validUntil)}</Field> : null}
          {/* "Accepted on" rather than "Accepted": the status badge above
              already reads Accepted, and two identical labels on one page
              are ambiguous to read and to announce. */}
          {q.acceptedAt ? <Field label="Accepted on">{formatDate(q.acceptedAt)}</Field> : null}
          {q.rejectedAt ? <Field label="Declined on">{formatDate(q.rejectedAt)}</Field> : null}
          {q.incoterm ? (
            <Field label="Incoterm">{[q.incoterm, q.namedPlace].filter(Boolean).join(' ')}</Field>
          ) : null}
          {q.destinationCountry ? (
            <Field label="Destination">
              {[q.destinationPort, q.destinationCountry].filter(Boolean).join(', ')}
            </Field>
          ) : null}
          {q.leadTimeDays !== null ? <Field label="Lead time">{q.leadTimeDays} days</Field> : null}
          {q.paymentTermsText ? <Field label="Payment terms">{q.paymentTermsText}</Field> : null}
          {q.packingSummary ? <Field label="Packing">{q.packingSummary}</Field> : null}
          {q.samplingTerms ? <Field label="Sampling">{q.samplingTerms}</Field> : null}
        </dl>
      </section>

      <p className="mt-section text-sm text-content-muted">
        Your TRIYARA contact can take you through this offer or prepare a revision.
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

/** `UNDER_NEGOTIATION` reads badly to somebody who does not work here. */
function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')
}

/**
 * The amount as we quoted it.
 *
 * Money arrives as a string because it was a Prisma `Decimal`, and it is parsed
 * only for display - the value the service carries is never a float.
 */
function formatMoney(amount: string, currency: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${amount} ${currency}`
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value)
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(value)
}
