import type { BuyerRequirementDetail } from '@triyara/core'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Separator } from '@triyara/ui'
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
 */
export function RequirementDetail({ requirement }: { requirement: BuyerRequirementDetail }) {
  const r = requirement

  return (
    <div className="space-y-gap-lg">
      <div className="space-y-2">
        <Link href="/portal/requirements" className="text-sm text-content-muted hover:underline">
          &larr; All requirements
        </Link>
        <h1 className="text-2xl font-semibold text-content">{r.title}</h1>
        <div className="flex flex-wrap items-center gap-gap">
          <span className="text-sm text-content-muted">{r.rfqNumber}</span>
          <Badge>{humanise(r.status)}</Badge>
          <Badge>{humanise(r.priority)} priority</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Commercial and shipment</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-gap-lg sm:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">What you asked us to source</CardTitle>
        </CardHeader>
        <CardContent>
          {r.items.length === 0 ? (
            <EmptyState
              title="No lines recorded"
              description="Your TRIYARA contact can add the detail of what you need."
            />
          ) : (
            <ul className="space-y-gap">
              {r.items.map((item, index) => (
                <li key={item.lineNumber} className="space-y-2">
                  {index > 0 ? <Separator /> : null}
                  <div className="pt-2">
                    <p className="font-medium text-content">{item.productName ?? 'Unnamed line'}</p>
                    <dl className="mt-2 grid gap-gap-lg sm:grid-cols-3">
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-content-muted">
        Your TRIYARA contact is handling the sourcing for this requirement.
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
