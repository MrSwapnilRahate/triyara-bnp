'use client'

import type { VerificationListItem } from '@triyara/db'
import {
  Alert,
  Button,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableLayout,
  DataTableRow,
  EmptyState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@triyara/ui'
import { VERIFICATION_STATUSES } from '@triyara/validation'
import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useId, useState } from 'react'

import { FilterSelect } from '@/components/data/filter-select'

type AccountOpt = { id: string; legalName: string }

export function VerificationQueue({
  items,
  nextCursor,
  accounts,
  accountNames,
  canCreate,
}: {
  items: VerificationListItem[]
  nextCursor: string | null
  accounts: AccountOpt[]
  accountNames: Record<string, string>
  canCreate: boolean
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createPanelId = useId()
  const accountLabelId = useId()

  function setStatus(value: string) {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set('status', value)
    else next.delete('status')
    next.delete('cursor')
    router.push(`/verifications?${next.toString()}`)
  }

  async function create(accountId: string) {
    setError(null)
    try {
      const res = await fetch('/api/v1/verifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      const body = await res.json()
      if (!res.ok || !body.success) throw new Error(body.errors?.[0]?.message ?? 'Failed')
      router.push(`/verifications/${body.data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <>
      <PageHeader
        title="Verification queue"
        description="Supplier verifications awaiting review, and the decisions already recorded."
        actions={
          canCreate ? (
            <Button
              variant="primary"
              onClick={() => setCreating((v) => !v)}
              aria-expanded={creating}
              aria-controls={createPanelId}
            >
              Start verification
            </Button>
          ) : null
        }
      />

      <div className="p-gutter">
        {error ? (
          <Alert tone="danger" className="mb-gap-lg">
            {error}
          </Alert>
        ) : null}

        {creating ? (
          <div
            id={createPanelId}
            className="mb-gap-lg flex flex-wrap items-center gap-gap rounded-md border border-line bg-surface p-gap-lg"
          >
            <span id={accountLabelId} className="text-base text-content-muted">
              Account
            </span>
            <Select onValueChange={(value) => value && void create(value)}>
              <SelectTrigger size="sm" aria-labelledby={accountLabelId} className="w-64">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.legalName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <DataTableLayout
          toolbar={
            <FilterSelect
              label="Status"
              allLabel="All statuses"
              value={sp.get('status') ?? undefined}
              onChange={(value) => setStatus(value ?? '')}
              options={VERIFICATION_STATUSES.map((s) => ({
                value: s,
                label: s.replace(/_/g, ' '),
              }))}
              className="w-56"
            />
          }
          {...(items.length === 0
            ? {
                state: (
                  <EmptyState
                    icon={<ShieldCheck />}
                    title="No verifications yet"
                    description="Verifications appear here once one is started for a supplier account."
                  />
                ),
              }
            : {})}
          footer={
            nextCursor ? (
              <Button asChild variant="secondary" size="sm">
                <Link
                  href={`/verifications?${new URLSearchParams({ ...Object.fromEntries(sp), cursor: nextCursor }).toString()}`}
                >
                  Load more
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-content-subtle">
                {items.length} verification{items.length === 1 ? '' : 's'}
              </span>
            )
          }
        >
          <DataTable caption="Verification queue">
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Supplier</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
                <DataTableHeaderCell>Decision</DataTableHeaderCell>
                <DataTableHeaderCell>Submitted</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Action</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((v) => (
                <DataTableRow key={v.id}>
                  <DataTableCell className="font-medium text-content">
                    {accountNames[v.accountId] ?? v.accountId}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={v.status} />
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">{v.decision ?? '—'}</DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '—'}
                  </DataTableCell>
                  <DataTableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/verifications/${v.id}`}>Review</Link>
                    </Button>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </DataTableLayout>
      </div>
    </>
  )
}
