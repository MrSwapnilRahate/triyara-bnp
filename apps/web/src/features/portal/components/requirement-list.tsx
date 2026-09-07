import type { BuyerPendingRequirementList, BuyerRequirementList } from '@triyara/core'
import { Badge, EmptyState, PageHeader } from '@triyara/ui'
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
 *
 * Set as a ledger rather than a stack of cards. Seven requirements were seven
 * identical bordered boxes on a page that is already a list of one kind of
 * thing; the border was repeating what the spacing already said. Hairlines
 * separate the rows and the containers are gone.
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
      <>
        <Header />
        <EmptyState
          title="No requirements yet"
          description="Tell us what you need and our sourcing team will take it from there."
        />
      </>
    )
  }

  return (
    <>
      <Header />

      {/* Submitted first, and newest anyway. Something the buyer sent minutes
          ago belongs above work that has been running for weeks. */}
      {pending.items.length > 0 ? (
        <ul className="divide-y divide-line border-b border-line">
          {pending.items.map((p) => (
            <li key={p.reference} className="py-gap-lg">
              <div className="flex flex-wrap items-baseline justify-between gap-gap-lg">
                {/* Not a link. There is no detail page for an enquiry nobody
                    has looked at yet, and a link to a fuller version of what
                    they just typed would promise one. */}
                <h2 className="text-md font-medium text-content">{p.product}</h2>
                <p className="flex flex-wrap items-baseline gap-gap text-sm text-content-muted">
                  <span className="font-mono">{p.reference}</span>
                  <span>sent {formatDate(p.submittedAt)}</span>
                </p>
              </div>
              <dl className="mt-gap flex flex-wrap gap-x-section gap-y-gap">
                <Field label="Status">
                  {/* A different variant from the RFQ badge, deliberately.
                      These two things are at different stages and must not
                      read as the same kind of row. */}
                  <Badge variant="outline">Submitted — under review</Badge>
                </Field>
                <Field label="Quantity">{p.quantity}</Field>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="divide-y divide-line">
        {list.items.map((r) => (
          <li key={r.rfqNumber} className="py-gap-lg">
            <div className="flex flex-wrap items-baseline justify-between gap-gap-lg">
              <h2 className="text-md font-medium text-content">
                {/* Linked by number, not id. `rfqNumber` is already on this
                    DTO and is what the detail route matches on; the row id
                    stays out of every buyer-facing projection. */}
                <Link
                  href={`/portal/requirements/${encodeURIComponent(r.rfqNumber)}`}
                  className="focus-ring hover:underline"
                >
                  {r.title}
                </Link>
              </h2>
              <p className="flex flex-wrap items-baseline gap-gap text-sm text-content-muted">
                {/* A reference, not prose. */}
                <span className="font-mono">{r.rfqNumber}</span>
                <span>raised {formatDate(r.createdAt)}</span>
              </p>
            </div>
            <dl className="mt-gap flex flex-wrap gap-x-section gap-y-gap">
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
          </li>
        ))}
      </ul>

      {/* Said plainly rather than paged. The list is capped, and a buyer with
          more requirements than fit should be told so rather than shown a
          silently truncated set. */}
      {list.hasMore ? (
        <p className="mt-gap-lg text-sm text-content-muted">
          Showing your most recent requirements. Your TRIYARA contact can give you the full history.
        </p>
      ) : null}
    </>
  )
}

function Header() {
  return (
    <PageHeader
      className="-mx-gutter mb-gap-lg"
      title="Your requirements"
      description="What you have asked us to source, and where each one has got to."
      actions={
        // A link, not a Button: this navigates. `text-accent-fg` rather than
        // the `text-on-accent` that was here - the latter is not a colour key
        // in the preset, so the label was inheriting the page's near-black and
        // sitting on saturated blue at 3.5:1.
        <Link
          href="/portal/requirements/new"
          className="focus-ring rounded-md bg-accent px-gap py-gap-xs text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          New requirement
        </Link>
      }
    />
  )
}

/** One fact about a requirement: what it is, then what it says. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-gap">
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
