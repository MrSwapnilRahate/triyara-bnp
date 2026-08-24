import type { BuyerQuotationList } from '@triyara/core'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@triyara/ui'

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
 */
export function QuotationList({ list }: { list: BuyerQuotationList }) {
  if (list.items.length === 0) {
    return (
      <div className="space-y-gap-lg">
        <Header />
        <EmptyState
          title="No quotations yet"
          description="When we have priced one of your requirements, the offer will appear here."
        />
      </div>
    )
  }

  return (
    <div className="space-y-gap-lg">
      <Header />

      <ul className="space-y-gap">
        {list.items.map((q) => (
          <li key={`${q.quotationNumber}-${q.revisionNumber}`}>
            <Card>
              <CardHeader>
                <CardTitle as="h2">
                  {q.grandTotal ? formatMoney(q.grandTotal, q.currency) : 'Pricing in progress'}
                </CardTitle>
                <CardDescription>
                  {q.quotationNumber} &middot; revision {q.revisionNumber}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-gap-lg sm:grid-cols-3">
                  <Field label="Status">
                    <Badge>{humanise(q.status)}</Badge>
                  </Field>
                  {q.sentAt ? <Field label="Sent">{formatDate(q.sentAt)}</Field> : null}
                  {/* Only rendered when we actually gave the offer an expiry.
                      An empty row would imply a deadline that does not exist. */}
                  {q.validUntil ? (
                    <Field label="Valid until">{formatDate(q.validUntil)}</Field>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {list.hasMore ? (
        <p className="text-sm text-content-muted">
          Showing your most recent quotations. Your TRIYARA contact can give you the full history.
        </p>
      ) : null}
    </div>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-content">Your quotations</h1>
      <p className="text-content-muted">The offers we have prepared against your requirements.</p>
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
