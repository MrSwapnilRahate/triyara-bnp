import type { BuyerQuotationDetailView } from '@triyara/core'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Separator } from '@triyara/ui'
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
 */
export function QuotationDetail({ quotation }: { quotation: BuyerQuotationDetailView }) {
  const q = quotation

  return (
    <div className="space-y-gap-lg">
      <div className="space-y-2">
        <Link href="/portal/quotations" className="text-sm text-content-muted hover:underline">
          &larr; All quotations
        </Link>
        <h1 className="text-2xl font-semibold text-content">
          {q.title ?? `Quotation ${q.quotationNumber}`}
        </h1>
        <div className="flex flex-wrap items-center gap-gap">
          <span className="text-sm text-content-muted">
            {q.quotationNumber} &middot; revision {q.revisionNumber}
          </span>
          <Badge>{humanise(q.status)}</Badge>
          <Badge>{humanise(q.type)} offer</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">What we quoted</CardTitle>
        </CardHeader>
        <CardContent>
          {q.lines.length === 0 ? (
            <EmptyState
              title="No lines recorded"
              description="Your TRIYARA contact can talk you through what this offer covers."
            />
          ) : (
            <ul className="space-y-gap">
              {q.lines.map((line, index) => (
                <li key={line.lineNumber} className="space-y-2">
                  {index > 0 ? <Separator /> : null}
                  <div className="pt-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-gap">
                      <p className="font-medium text-content">
                        {line.productName ?? 'Unnamed line'}
                      </p>
                      <p className="font-medium text-content">
                        {formatMoney(line.lineSubtotal, q.currency)}
                      </p>
                    </div>
                    <dl className="mt-2 grid gap-gap-lg sm:grid-cols-3">
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
                      {line.hsCode ? <Field label="HS code">{line.hsCode}</Field> : null}
                      {line.requiredCertifications.length > 0 ? (
                        <Field label="Certifications">
                          {line.requiredCertifications.map(humanise).join(', ')}
                        </Field>
                      ) : null}
                    </dl>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">The price</CardTitle>
        </CardHeader>
        <CardContent>
          {/* The components are shown so the total can be checked rather than
              taken on trust. They are all our price to the buyer; what the
              goods cost us is not on this page and is never fetched. */}
          <dl className="space-y-2">
            <Amount label="Subtotal" value={q.subtotal} currency={q.currency} />

            {q.charges.map((charge, index) => (
              <Amount
                key={`${charge.type}-${index}`}
                label={charge.label ?? humanise(charge.type)}
                value={charge.amount}
                currency={q.currency}
                negative={charge.isDeduction}
              />
            ))}

            {/* Only when nothing was broken out line by line: otherwise the
                same money would be presented twice. */}
            {q.charges.length === 0 ? (
              <>
                <Amount label="Charges" value={q.chargesTotal} currency={q.currency} />
                <Amount label="Discount" value={q.discountTotal} currency={q.currency} negative />
              </>
            ) : null}

            <Amount label="Tax" value={q.taxTotal} currency={q.currency} />
          </dl>

          {/* Outside the list above, and its own list below. A `dl` may hold
              only dt/dd groups, and a wrapper that pairs nothing is a
              violation - so the rule separates two lists rather than sitting
              inside one. */}
          <Separator className="my-3" />

          <dl className="flex items-baseline justify-between">
            <dt className="font-medium text-content">Total</dt>
            <dd className="text-lg font-semibold text-content">
              {q.grandTotal ? formatMoney(q.grandTotal, q.currency) : 'Pricing in progress'}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Terms and shipment</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-gap-lg sm:grid-cols-3">
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
            {q.leadTimeDays !== null ? (
              <Field label="Lead time">{q.leadTimeDays} days</Field>
            ) : null}
            {q.paymentTermsText ? <Field label="Payment terms">{q.paymentTermsText}</Field> : null}
            {q.packingSummary ? <Field label="Packing">{q.packingSummary}</Field> : null}
            {q.samplingTerms ? <Field label="Sampling">{q.samplingTerms}</Field> : null}
          </dl>
        </CardContent>
      </Card>

      <p className="text-sm text-content-muted">
        Your TRIYARA contact can take you through this offer or prepare a revision.
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-content-muted">{label}</dt>
      <dd className="font-medium text-content">{children}</dd>
    </div>
  )
}

/** One row of the price breakdown. Rendered only when we hold the figure. */
function Amount({
  label,
  value,
  currency,
  negative = false,
}: {
  label: string
  value: string | null
  currency: string
  negative?: boolean
}) {
  if (value === null || Number(value) === 0) return null

  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-sm text-content-muted">{label}</dt>
      <dd className="text-sm text-content">
        {negative ? '−' : ''}
        {formatMoney(value, currency)}
      </dd>
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
