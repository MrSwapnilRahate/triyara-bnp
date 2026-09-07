import type { BuyerQuotationList } from '@triyara/core'
import { Badge, EmptyState, PageHeader } from '@triyara/ui'
import Link from 'next/link'

/**
 * The offers TRIYARA has sent this buyer.
 *
 * Presentational: it takes the list the service built and nothing else. Every
 * row is an offer we made them - our price, in our currency, on our terms. What
 * is absent is how we arrived at it: no supplier, no sourced cost, no margin, no
 * breakdown, because that is the half of the transaction the intermediary keeps.
 *
 * Read-only. Accepting or negotiating an offer is a conversation with a TRIYARA
 * contact, not a button here.
 *
 * The amount leads each row, because that is what a buyer is scanning for, and
 * it is set in tabular figures so a column of offers lines up as a column.
 */
export function QuotationList({ list }: { list: BuyerQuotationList }) {
  if (list.items.length === 0) {
    return (
      <>
        <Header />
        <EmptyState
          title="No quotations yet"
          description="When we have priced one of your requirements, the offer will appear here."
        />
      </>
    )
  }

  return (
    <>
      <Header />

      <ul className="divide-y divide-line">
        {list.items.map((q) => (
          <li key={`${q.quotationNumber}-${q.revisionNumber}`} className="py-gap-lg">
            <div className="flex flex-wrap items-baseline justify-between gap-gap-lg">
              <h2 className="text-md font-medium tabular-nums text-content">
                {q.grandTotal ? formatMoney(q.grandTotal, q.currency) : 'Pricing in progress'}
              </h2>
              <p className="flex flex-wrap items-baseline gap-gap text-sm text-content-muted">
                {/* Linked by number, not id. `quotationNumber` is already on
                    this DTO and is what the detail route matches on; the row
                    id stays out of every buyer-facing projection. The number
                    names a revision family rather than one row, so the detail
                    resolves to whichever revision is currently standing. */}
                <Link
                  href={`/portal/quotations/${encodeURIComponent(q.quotationNumber)}`}
                  className="focus-ring font-mono hover:underline"
                >
                  {q.quotationNumber}
                </Link>
                <span>revision {q.revisionNumber}</span>
              </p>
            </div>
            <dl className="mt-gap flex flex-wrap gap-x-section gap-y-gap">
              <Field label="Status">
                <Badge>{humanise(q.status)}</Badge>
              </Field>
              {q.sentAt ? <Field label="Sent">{formatDate(q.sentAt)}</Field> : null}
              {/* Only rendered when we actually gave the offer an expiry.
                  An empty row would imply a deadline that does not exist. */}
              {q.validUntil ? <Field label="Valid until">{formatDate(q.validUntil)}</Field> : null}
            </dl>
          </li>
        ))}
      </ul>

      {list.hasMore ? (
        <p className="mt-gap-lg text-sm text-content-muted">
          Showing your most recent quotations. Your TRIYARA contact can give you the full history.
        </p>
      ) : null}
    </>
  )
}

function Header() {
  return (
    <PageHeader
      className="-mx-gutter mb-gap-lg"
      title="Your quotations"
      description="The offers we have prepared against your requirements."
    />
  )
}

/** One fact about an offer: what it is, then what it says. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-gap">
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
 * `grandTotal` arrives as a string because it was a Prisma `Decimal`, and it is
 * parsed only for display - the value the service carries is never a float.
 */
function formatMoney(amount: string, currency: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${amount} ${currency}`
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value)
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(value)
}
