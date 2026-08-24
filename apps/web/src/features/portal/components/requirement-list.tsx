import type { BuyerRequirementList } from '@triyara/core'
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
 * The buyer's own requirements.
 *
 * Presentational: it takes the list the service built and nothing else - no
 * context, no session, no repository - so what reaches the screen is decided in
 * one place and can be asserted directly.
 *
 * Every row is the buyer's own record. What is absent is the other side of it:
 * no supplier name, no awarded supplier, no sourcing status beyond the RFQ's own
 * status, because TRIYARA sits between the two and the screen must not quietly
 * stop doing so.
 */
export function RequirementList({ list }: { list: BuyerRequirementList }) {
  if (list.items.length === 0) {
    return (
      <div className="space-y-gap-lg">
        <Header />
        <EmptyState
          title="No requirements yet"
          description="When you raise a requirement with your TRIYARA contact, it will appear here."
        />
      </div>
    )
  }

  return (
    <div className="space-y-gap-lg">
      <Header />

      <ul className="space-y-gap">
        {list.items.map((r) => (
          <li key={r.rfqNumber}>
            <Card>
              <CardHeader>
                <CardTitle as="h2">{r.title}</CardTitle>
                <CardDescription>
                  {r.rfqNumber} &middot; raised {formatDate(r.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-gap-lg sm:grid-cols-3">
                  <Field label="Status">
                    <Badge>{humanise(r.status)}</Badge>
                  </Field>
                  <Field label="Priority">{humanise(r.priority)}</Field>
                  {r.quotationDeadline ? (
                    <Field label="Quotes needed by">{formatDate(r.quotationDeadline)}</Field>
                  ) : null}
                  {r.destinationCountry ? (
                    <Field label="Destination">
                      {[r.destinationPort, r.destinationCountry].filter(Boolean).join(', ')}
                    </Field>
                  ) : null}
                  {r.incoterm ? <Field label="Incoterm">{r.incoterm}</Field> : null}
                  {r.currency ? <Field label="Currency">{r.currency}</Field> : null}
                  {r.expectedShipmentDate ? (
                    <Field label="Expected shipment">{formatDate(r.expectedShipmentDate)}</Field>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* Said plainly rather than paged. The list is capped, and a buyer with
          more requirements than fit should be told so rather than shown a
          silently truncated set. */}
      {list.hasMore ? (
        <p className="text-sm text-content-muted">
          Showing your most recent requirements. Your TRIYARA contact can give you the full history.
        </p>
      ) : null}
    </div>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-content">Your requirements</h1>
      <p className="text-content-muted">
        What you have asked us to source, and where each one has got to.
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

/** `PENDING_APPROVAL` reads badly to somebody who does not work here. */
function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(value)
}
