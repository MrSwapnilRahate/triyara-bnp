'use client'

import type { VerificationListItem } from '@triyara/db'
import { VERIFICATION_STATUSES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type AccountOpt = { id: string; legalName: string }

const field =
  'rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white focus:border-gold/60 focus:outline-none'
const btn =
  'rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'

const STATUS_COLOR: Record<string, string> = {
  VERIFIED: 'text-green-400',
  REJECTED: 'text-red-400',
  EXPIRED: 'text-red-400',
  SUSPENDED: 'text-amber-400',
  DOCUMENTS_REQUESTED: 'text-amber-400',
}

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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-gold text-2xl font-bold">Verification queue</h1>
        {canCreate ? (
          <button className={btn} onClick={() => setCreating((v) => !v)}>
            Start verification
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {creating ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-4">
          <span className="text-sm text-white/50">Account:</span>
          <select
            className={field}
            defaultValue=""
            onChange={(e) => e.target.value && void create(e.target.value)}
          >
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.legalName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-5">
        <select
          className={field}
          defaultValue={sp.get('status') ?? ''}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {VERIFICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Decision</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-white/40">
                  No verifications yet.
                </td>
              </tr>
            ) : (
              items.map((v) => (
                <tr key={v.id} className="border-t border-white/5">
                  <td className="px-4 py-3 text-white">
                    {accountNames[v.accountId] ?? v.accountId}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_COLOR[v.status] ?? 'text-white/60'}>{v.status}</span>
                  </td>
                  <td className="px-4 py-3 text-white/50">{v.decision ?? '-'}</td>
                  <td className="px-4 py-3 text-white/50">
                    {v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/verifications/${v.id}`}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <div className="mt-4 text-center">
          <Link
            href={`/verifications?${new URLSearchParams({ ...Object.fromEntries(sp), cursor: nextCursor }).toString()}`}
            className="hover:text-gold text-sm text-white/60"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </div>
  )
}
