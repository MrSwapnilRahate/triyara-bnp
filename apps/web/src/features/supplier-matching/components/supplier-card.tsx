'use client'

import { Badge, Card, StatusBadge } from '@triyara/ui'
import { ShieldCheck } from 'lucide-react'

import type { ShortlistSupplier, SupplierScore } from '../types'

const BAND_TONE = {
  ready: 'success',
  usable: 'warning',
  incomplete: 'neutral',
} as const

const BAND_LABEL = {
  ready: 'Ready',
  usable: 'Usable',
  incomplete: 'Incomplete',
} as const

/** "3 days ago" beats a date when the question is "have we spoken lately". */
function relative(iso: string | null): string {
  if (!iso) return 'Never contacted'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Contacted today'
  if (days === 1) return 'Contacted yesterday'
  if (days < 30) return `Contacted ${days} days ago`
  const months = Math.floor(days / 30)
  return `Contacted ${months} month${months === 1 ? '' : 's'} ago`
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-2xs uppercase tracking-wide text-content-subtle">{label}</dt>
      <dd className="truncate text-xs text-content">{value}</dd>
    </div>
  )
}

/**
 * One supplier in the shortlist.
 *
 * A card carries what settles a choice without opening anything — score,
 * verification, where they are, what they are certified for, where they ship,
 * how they pack, what terms they work on, and when we last spoke. Everything
 * else is a click away, which is the point of the thirty seconds.
 */
export function SupplierCard({
  supplier,
  score,
  selected,
  onOpen,
}: {
  supplier: ShortlistSupplier
  score: SupplierScore | null
  selected: boolean
  onOpen: () => void
}) {
  const active = supplier.certifications.filter((c) => c.status === 'ACTIVE')

  return (
    <Card
      className={`p-0 transition-colors ${selected ? 'border-accent' : 'hover:border-line-strong'}`}
    >
      {/*
        The whole card is the control. A card with a separate "view" button
        makes the obvious click do nothing, which is the kind of small friction
        that adds up across a shortlist.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        aria-label={`Open ${supplier.companyName}`}
        className="focus-ring block w-full rounded-[inherit] p-gutter text-left"
      >
        <div className="flex flex-wrap items-start justify-between gap-gap">
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-content">{supplier.companyName}</p>
            <p className="font-mono text-2xs text-content-muted">{supplier.supplierCode}</p>
          </div>

          <div className="flex shrink-0 items-center gap-gap">
            {supplier.isVerified ? (
              <Badge tone="success" size="sm" dot>
                Verified
              </Badge>
            ) : (
              <StatusBadge status={supplier.status} size="sm" />
            )}
            {score ? (
              <div className="text-right">
                <p className="text-md font-semibold leading-none text-content">{score.score}</p>
                <Badge tone={BAND_TONE[score.band]} size="sm">
                  {BAND_LABEL[score.band]}
                </Badge>
              </div>
            ) : null}
          </div>
        </div>

        <dl className="mt-gap-lg grid gap-gap sm:grid-cols-3">
          <Fact
            label="Country"
            value={[supplier.city, supplier.country].filter(Boolean).join(', ') || null}
          />
          <Fact label="MOQ" value={supplier.moq} />
          <Fact
            label="Lead time"
            value={supplier.leadTimeDays === null ? null : `${supplier.leadTimeDays} days`}
          />
          <Fact label="Packaging" value={supplier.packaging} />
          <Fact label="Payment terms" value={supplier.paymentTerms} />
          <Fact
            label="Exports to"
            value={supplier.exportCountries.length > 0 ? supplier.exportCountries.join(', ') : null}
          />
        </dl>

        <div className="mt-gap-lg flex flex-wrap items-center gap-gap-xs">
          {active.length > 0 ? (
            <>
              <ShieldCheck className="size-3.5 text-content-muted" aria-hidden="true" />
              {active.map((certification) => (
                <Badge key={certification.id} tone="neutral" size="sm">
                  {certification.type}
                </Badge>
              ))}
            </>
          ) : (
            <span className="text-2xs text-content-subtle">No active certifications</span>
          )}
        </div>

        <p className="mt-gap text-2xs text-content-subtle">
          {relative(score?.lastContactedAt ?? null)}
        </p>
      </button>
    </Card>
  )
}
