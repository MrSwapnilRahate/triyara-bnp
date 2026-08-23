'use client'

import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
  useToast,
} from '@triyara/ui'
import { ArrowRight, Mail, Phone } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { QueryBoundary } from '@/components/data/query-boundary'
import { Can } from '@/lib/ability-context'

import {
  usePromoteQuoteRequest,
  useQuoteRequest,
  useReviewQuoteRequest,
} from '../api/quote-requests'
import type { QuoteRequest, QuoteRequestStatus } from '../types'

/**
 * Statuses an operator may set by hand.
 *
 * PROMOTED is absent, and the type says so rather than the array alone: that
 * status asserts an RFQ exists, so only the promote action may set it. The
 * request schema excludes it too, so the rule holds at the API as well.
 */
type TriageStatus = Exclude<QuoteRequestStatus, 'PROMOTED'>
const TRIAGE_STATUSES: TriageStatus[] = ['NEW', 'IN_REVIEW', 'QUALIFIED', 'REJECTED']

/** One labelled value. Renders an explicit dash rather than collapsing, so a
 *  blank answer reads as "not asked/not given" instead of vanishing. */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-content-muted">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">{value?.trim() ? value : '—'}</dd>
    </div>
  )
}

export function QuoteRequestDetail({ id }: { id: string }) {
  const query = useQuoteRequest(id)

  return (
    <QueryBoundary
      isPending={query.isPending}
      isError={query.isError}
      error={query.error}
      data={query.data}
      onRetry={() => void query.refetch()}
    >
      {(data) => <Loaded quoteRequest={data.quoteRequest} version={data.version} />}
    </QueryBoundary>
  )
}

function Loaded({ quoteRequest: qr, version }: { quoteRequest: QuoteRequest; version: number }) {
  const toast = useToast()
  const review = useReviewQuoteRequest(qr.id)
  const promote = usePromoteQuoteRequest(qr.id)

  // A promoted enquiry is not triageable, and the panel holding this control is
  // hidden in that case - so falling back to IN_REVIEW never reaches the API.
  const [status, setStatus] = useState<TriageStatus>(
    qr.status === 'PROMOTED' ? 'QUALIFIED' : qr.status,
  )
  const [notes, setNotes] = useState(qr.reviewNotes ?? '')

  const [rfqNumber, setRfqNumber] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')

  const isPromoted = qr.status === 'PROMOTED'

  const saveReview = () => {
    review.mutate(
      { dto: { status, reviewNotes: notes }, version },
      {
        onSuccess: () => toast.success('Enquiry updated.'),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Could not update the enquiry.'),
      },
    )
  }

  const doPromote = () => {
    promote.mutate(
      { dto: { rfqNumber, buyerId, quantity: Number(quantity), unit }, version },
      {
        onSuccess: (r) => toast.success(`RFQ ${r.rfqNumber} created from this enquiry.`),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Could not promote the enquiry.'),
      },
    )
  }

  return (
    <>
      <PageHeader
        title={qr.product}
        description={`Enquiry ${qr.reference} · received ${new Date(qr.createdAt).toLocaleString()}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={qr.status} />
            {qr.leadScore ? <Badge tone="neutral">{qr.leadScore}</Badge> : null}
          </div>
        }
      />

      <div className="grid gap-gutter p-gutter lg:grid-cols-3">
        <div className="flex flex-col gap-gutter lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-base font-semibold">What they asked for</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Product" value={qr.product} />
              <Field label="Quantity (as stated)" value={qr.quantity} />
              <Field label="Monthly volume" value={qr.monthlyVolume} />
              <Field label="Packaging" value={qr.packaging} />
              <Field label="Target price" value={qr.targetPrice} />
              <Field label="Destination port" value={qr.destinationPort} />
              <Field label="Timeline" value={qr.timeline} />
            </dl>
            {qr.requirements?.trim() ? (
              <div className="mt-4">
                <Field label="Additional requirements" value={qr.requirements} />
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold">Who is asking</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Company" value={qr.companyName} />
              <Field label="Business type" value={qr.businessType} />
              <Field label="Country" value={qr.country} />
              <Field label="Import experience" value={qr.importExperience} />
              <Field label="Contact" value={qr.contactName} />
              <Field label="Preferred contact" value={qr.preferredContact} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild size="sm" variant="secondary" leadingIcon={<Mail />}>
                <a href={`mailto:${qr.contactEmail}`}>{qr.contactEmail}</a>
              </Button>
              {qr.contactPhone ? (
                <Button asChild size="sm" variant="secondary" leadingIcon={<Phone />}>
                  <a href={`tel:${qr.contactPhone}`}>{qr.contactPhone}</a>
                </Button>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-gutter">
          {/* Hidden rather than disabled for anyone without the right: a greyed
              control teaches a read-only user only that something exists they
              cannot have. */}
          <Can action="update" subject="QuoteRequest">
            <Card>
              <h2 className="mb-4 text-base font-semibold">Qualification</h2>
              {isPromoted ? (
                <p className="text-sm text-content-muted">
                  This enquiry became an RFQ. Work on the RFQ from here.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="qr-status">Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as TriageStatus)}>
                      <SelectTrigger id="qr-status" className="mt-gap-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRIAGE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="qr-notes">Review notes</Label>
                    <Textarea
                      id="qr-notes"
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Why this is or is not worth sourcing."
                    />
                  </div>
                  <Button onClick={saveReview} loading={review.isPending}>
                    Save
                  </Button>
                </div>
              )}
            </Card>
          </Can>

          {/* Promotion needs BOTH rights, and the service asserts both. Showing
              it to someone who holds only one would offer an action that fails. */}
          {!isPromoted ? (
            <Can action="update" subject="QuoteRequest">
              <Can action="create" subject="RFQ">
                <Card>
                  <h2 className="mb-1 text-base font-semibold">Promote to RFQ</h2>
                  <p className="mb-4 text-sm text-content-muted">
                    Creates a real RFQ against a buyer account. The buyer&rsquo;s own wording is
                    kept on the RFQ line.
                  </p>
                  <div className="flex flex-col gap-4">
                    <div>
                      <Label htmlFor="qr-rfq-number">RFQ number</Label>
                      <Input
                        id="qr-rfq-number"
                        value={rfqNumber}
                        onChange={(e) => setRfqNumber(e.target.value.toUpperCase())}
                        placeholder="RFQ-2026-000431"
                      />
                    </div>
                    <div>
                      <Label htmlFor="qr-buyer">Buyer account ID</Label>
                      <Input
                        id="qr-buyer"
                        value={buyerId}
                        onChange={(e) => setBuyerId(e.target.value)}
                        placeholder="Existing buyer account"
                      />
                      <p className="mt-1 text-xs text-content-muted">
                        An RFQ must name a buyer. Register the company first if it is not on file.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="qr-qty">Quantity</Label>
                        <Input
                          id="qr-qty"
                          inputMode="decimal"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="qr-unit">Unit</Label>
                        <Input
                          id="qr-unit"
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          placeholder="MT"
                        />
                      </div>
                    </div>
                    {/* Stated verbatim, because the two fields above are the
                        operator's reading of it and that reading should be
                        checkable. */}
                    <p className="text-xs text-content-muted">
                      Buyer stated: <span className="text-content">{qr.quantity}</span>
                    </p>
                    <Button
                      onClick={doPromote}
                      loading={promote.isPending}
                      disabled={!rfqNumber || !buyerId || !quantity || !unit}
                      trailingIcon={<ArrowRight />}
                    >
                      Promote to RFQ
                    </Button>
                  </div>
                </Card>
              </Can>
            </Can>
          ) : null}

          {qr.rfqId ? (
            <Card>
              <h2 className="mb-2 text-base font-semibold">Linked RFQ</h2>
              <Button asChild variant="secondary" trailingIcon={<ArrowRight />}>
                <Link href={`/rfqs/${qr.rfqId}`}>Open the RFQ</Link>
              </Button>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-4 text-base font-semibold">Intake</h2>
            <dl className="grid gap-4">
              <Field label="Reference" value={qr.reference} />
              <Field label="Source" value={qr.source} />
              <Field
                label="Reviewed"
                value={qr.reviewedAt ? new Date(qr.reviewedAt).toLocaleString() : null}
              />
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
