import type { BuyerPendingRequirementList, BuyerRequirementList } from '@triyara/core'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@triyara/ui'
import Link from 'next/link'

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
export function RequirementList({
  list,
  pending,
}: {
  list: BuyerRequirementList
  pending: BuyerPendingRequirementList
}) {
  if (list.items.length === 0 && pending.items.length === 0) {
    return (
      <div className="space-y-gap-lg">
        <Header />
        <EmptyState
          title="No requirements yet"
          description="Tell us what you need and our sourcing team will take it from there."
        />
      </div>
    )
  }

  return (
    <div className="space-y-gap-lg">
      <Header />

      {/* Submitted first, and newest anyway. Something the buyer sent minutes
          ago belongs above work that has been running for weeks. */}
      {pending.items.length > 0 ? (
        <ul className="space-y-gap">
          {pending.items.map((p) => (
            <li key={p.reference}>
              <Card>
                <CardHeader>
                  {/* Not a link. There is no detail page for an enquiry nobody
                      has looked at yet, and a link to a fuller version of what
                      they just typed would promise one. */}
                  <CardTitle as="h2">{p.product}</CardTitle>
                  <CardDescription>
                    {p.reference} &middot; sent {formatDate(p.submittedAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-gap-lg sm:grid-cols-3">
                    <Field label="Status">
                      {/* A different variant from the RFQ badge, deliberately.
                          These two things are at different stages and must not
                          read as the same kind of row. */}
                      <Badge variant="outline">Submitted — under review</Badge>
                    </Field>
                    <Field label="Quantity">{p.quantity}</Field>
                  </dl>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="space-y-gap">
        {list.items.map((r) => (
          <li key={r.rfqNumber}>
            <Card>
              <CardHeader>
                <CardTitle as="h2">
                  {/* Linked by number, not id. `rfqNumber` is already on this
                      DTO and is what the detail route matches on; the row id
                      stays out of every buyer-facing projection. */}
                  <Link
                    href={`/portal/requirements/${encodeURIComponent(r.rfqNumber)}`}
                    className="hover:underline"
                  >
                    {r.title}
                  </Link>
                </CardTitle>
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
    <div className="flex flex-wrap items-start justify-between gap-gap">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-content">Your requirements</h1>
        <p className="text-content-muted">
          What you have asked us to source, and where each one has got to.
        </p>
      </div>
      <Link
        href="/portal/requirements/new"
        className="focus-ring text-on-accent rounded-md bg-accent px-gap py-gap-xs text-sm font-medium"
      >
        New requirement
      </Link>
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
