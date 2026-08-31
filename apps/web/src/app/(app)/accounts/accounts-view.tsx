'use client'

import type { AccountRecord } from '@triyara/db'
import { RELATIONSHIP_STATUSES, type RelationshipStatus } from '@triyara/validation'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  useAccounts,
  useBulkAccountStatus,
  useCreateAccount,
  useDeleteAccount,
  useRestoreAccount,
  useUpdateAccount,
} from '@/features/accounts/api/accounts'
import { useAbility } from '@/lib/ability-context'

const field =
  'w-full rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gold/60 focus:outline-none'
const btn =
  'rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'
const ghost = 'rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:text-white'

const STATUS_STYLES: Record<string, string> = {
  PROSPECT: 'bg-white/10 text-white/60',
  ACTIVE: 'bg-blue-500/15 text-blue-300',
  PREFERRED: 'bg-green-500/15 text-green-300',
  DORMANT: 'bg-amber-500/15 text-amber-300',
  BLACKLISTED: 'bg-red-500/15 text-red-300',
}

/** Trimmed field, or undefined when blank - the shape the DTOs expect. */
function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key)
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? undefined : t
}

/** What to show a user when a mutation fails. ApiError already carries the API's message. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

type Dialog =
  | { type: 'create' }
  | { type: 'edit'; account: AccountRecord }
  | { type: 'delete'; account: AccountRecord }
  | { type: 'restore'; account: AccountRecord }
  | null

export function AccountsView() {
  const router = useRouter()
  const params = useSearchParams()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const ability = useAbility()
  const canWrite = ability.can('create', 'Account')

  // Straight through to the API, which parses it with the same
  // `listAccountsQuerySchema` the page used. Nothing about the query is
  // interpreted here, so search, filters, ordering and the cursor stay the
  // server's business.
  const search = params.toString()
  const query = useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search])
  const { data, isPending, error } = useAccounts(query)
  const accounts: AccountRecord[] = data?.items ?? []
  // `nextCursor` is non-null exactly when there is another page - the repository
  // sets it from the same `hasMore` - so it alone decides whether Next is live.
  const nextCursor = data?.meta.pagination?.nextCursor ?? null

  const remove = useDeleteAccount()
  const restore = useRestoreAccount()

  function setParam(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v)
      else sp.delete(k)
    }
    router.push(`/accounts?${sp.toString()}`)
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gold">Accounts</h1>
        {canWrite ? (
          <button className={btn} onClick={() => setDialog({ type: 'create' })}>
            New account
          </button>
        ) : null}
      </div>

      {/* Filters */}
      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          setParam({
            q: String(fd.get('q') ?? ''),
            country: String(fd.get('country') ?? ''),
            relationshipStatus: String(fd.get('relationshipStatus') ?? ''),
            ownerId: String(fd.get('ownerId') ?? ''),
            includeDeleted: fd.get('includeDeleted') ? 'true' : '',
            cursor: undefined,
          })
        }}
      >
        <input
          name="q"
          defaultValue={params.get('q') ?? ''}
          placeholder="Search name"
          className={`${field} w-48`}
        />
        <input
          name="country"
          defaultValue={params.get('country') ?? ''}
          placeholder="Country (ISO2)"
          className={`${field} w-32`}
        />
        <select
          name="relationshipStatus"
          defaultValue={params.get('relationshipStatus') ?? ''}
          className={`${field} w-40`}
        >
          <option value="">Any status</option>
          {RELATIONSHIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          name="ownerId"
          defaultValue={params.get('ownerId') ?? ''}
          placeholder="Owner id"
          className={`${field} w-40`}
        />
        <label className="flex items-center gap-2 text-xs text-white/50">
          <input
            type="checkbox"
            name="includeDeleted"
            defaultChecked={params.get('includeDeleted') === 'true'}
          />
          Include deleted
        </label>
        <button className={ghost} type="submit">
          Apply
        </button>
      </form>

      {/* Bulk toolbar */}
      {selected.size > 0 ? (
        <BulkToolbar ids={[...selected]} onDone={() => setSelected(new Set())} />
      ) : null}

      {/* Table / empty */}
      {error ? (
        <div className="mt-16 rounded-xl border border-red-500/30 bg-red-500/10 py-16 text-center">
          <p className="text-sm text-red-300">{message(error)}</p>
        </div>
      ) : isPending ? (
        <div className="mt-16 rounded-xl border border-dashed border-white/15 py-16 text-center">
          <p className="text-sm text-white/50">Loading accounts…</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed border-white/15 py-16 text-center">
          <p className="text-sm text-white/50">No accounts match these filters.</p>
          {canWrite ? (
            <button className={`${btn} mt-4`} onClick={() => setDialog({ type: 'create' })}>
              Create the first account
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-white/40">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                <th className="px-3 py-3">Legal name</th>
                <th className="px-3 py-3">Country</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className={`border-t border-white/5 ${a.deletedAt ? 'opacity-50' : ''}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      disabled={!!a.deletedAt}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-white">{a.legalName}</div>
                    {a.displayName ? (
                      <div className="text-xs text-white/40">{a.displayName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-white/70">{a.country ?? '-'}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.relationshipStatus]}`}
                    >
                      {a.relationshipStatus}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-white/70">{a.owner?.name ?? '-'}</td>
                  <td className="px-3 py-3 text-white/50">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {canWrite ? (
                      a.deletedAt ? (
                        <button
                          className={ghost}
                          onClick={() => setDialog({ type: 'restore', account: a })}
                        >
                          Restore
                        </button>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            className={ghost}
                            onClick={() => setDialog({ type: 'edit', account: a })}
                          >
                            Edit
                          </button>
                          <button
                            className={ghost}
                            onClick={() => setDialog({ type: 'delete', account: a })}
                          >
                            Delete
                          </button>
                        </div>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination (cursor) */}
      <div className="mt-4 flex items-center justify-between text-sm text-white/50">
        <button className={ghost} onClick={() => setParam({ cursor: undefined })}>
          First page
        </button>
        <button
          className={ghost}
          disabled={!nextCursor}
          onClick={() => nextCursor && setParam({ cursor: nextCursor })}
        >
          Next
        </button>
      </div>

      {dialog?.type === 'create' ? (
        <CreateDialog onClose={() => setDialog(null)} />
      ) : dialog?.type === 'edit' ? (
        <EditDialog account={dialog.account} onClose={() => setDialog(null)} />
      ) : dialog?.type === 'delete' ? (
        <ConfirmDialog
          title="Delete account"
          body={`Soft-delete "${dialog.account.legalName}"? It can be restored later.`}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() =>
            remove.mutate(
              { id: dialog.account.id, version: dialog.account.version },
              { onSuccess: () => setDialog(null) },
            )
          }
          onClose={() => setDialog(null)}
        />
      ) : dialog?.type === 'restore' ? (
        <ConfirmDialog
          title="Restore account"
          body={`Restore "${dialog.account.legalName}"?`}
          pending={restore.isPending}
          error={restore.error}
          onConfirm={() =>
            restore.mutate(
              { id: dialog.account.id, version: dialog.account.version },
              { onSuccess: () => setDialog(null) },
            )
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-elevated p-6">
        <h2 className="text-lg font-semibold text-gold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount()
  return (
    <Modal title="New account">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          create.mutate(
            {
              legalName: String(fd.get('legalName') ?? '').trim(),
              displayName: str(fd, 'displayName'),
              country: str(fd, 'country'),
              relationshipStatus: str(fd, 'relationshipStatus') as RelationshipStatus | undefined,
              source: str(fd, 'source'),
            },
            { onSuccess: () => onClose() },
          )
        }}
      >
        <input name="legalName" required placeholder="Legal name" className={field} />
        <input name="displayName" placeholder="Display name (optional)" className={field} />
        <input name="country" placeholder="Country (ISO2, optional)" className={field} />
        <select name="relationshipStatus" defaultValue="PROSPECT" className={field}>
          {RELATIONSHIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input name="source" placeholder="Source (optional)" className={field} />
        {create.error ? <p className="text-sm text-red-400">{message(create.error)}</p> : null}
        <DialogButtons pending={create.isPending} onClose={onClose} submitLabel="Create" />
      </form>
    </Modal>
  )
}

function EditDialog({ account, onClose }: { account: AccountRecord; onClose: () => void }) {
  const update = useUpdateAccount()
  return (
    <Modal title="Edit account">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          update.mutate(
            {
              id: account.id,
              // The version this row was rendered with, sent as If-Match by the
              // api client. A genuine conflict still comes back as a 412.
              version: account.version,
              dto: {
                legalName: str(fd, 'legalName'),
                displayName: str(fd, 'displayName') ?? null,
                country: str(fd, 'country') ?? null,
                source: str(fd, 'source') ?? null,
              },
            },
            { onSuccess: () => onClose() },
          )
        }}
      >
        <input name="legalName" defaultValue={account.legalName} className={field} />
        <input
          name="displayName"
          defaultValue={account.displayName ?? ''}
          placeholder="Display name"
          className={field}
        />
        <input
          name="country"
          defaultValue={account.country ?? ''}
          placeholder="Country (ISO2)"
          className={field}
        />
        <input
          name="source"
          defaultValue={account.source ?? ''}
          placeholder="Source"
          className={field}
        />
        {update.error ? <p className="text-sm text-red-400">{message(update.error)}</p> : null}
        <DialogButtons pending={update.isPending} onClose={onClose} submitLabel="Save" />
      </form>
    </Modal>
  )
}

function ConfirmDialog({
  title,
  body,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  pending: boolean
  error: unknown
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm()
        }}
      >
        <p className="text-sm text-white/60">{body}</p>
        {error ? <p className="text-sm text-red-400">{message(error)}</p> : null}
        <DialogButtons pending={pending} onClose={onClose} submitLabel="Confirm" />
      </form>
    </Modal>
  )
}

function BulkToolbar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const bulk = useBulkAccountStatus()
  return (
    <form
      className="mt-4 flex items-center gap-3 rounded-lg border border-gold/25 bg-gold/[0.06] px-4 py-2"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        bulk.mutate(
          {
            action: 'set_status',
            ids,
            payload: {
              relationshipStatus: String(fd.get('relationshipStatus')) as RelationshipStatus,
            },
          },
          { onSuccess: () => onDone() },
        )
      }}
    >
      <span className="text-sm text-gold">{ids.length} selected</span>
      <select name="relationshipStatus" defaultValue="ACTIVE" className={`${field} w-40`}>
        {RELATIONSHIP_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button className={ghost} disabled={bulk.isPending}>
        Apply status
      </button>
      {bulk.error ? <span className="text-sm text-red-400">{message(bulk.error)}</span> : null}
    </form>
  )
}

function DialogButtons({
  pending,
  onClose,
  submitLabel,
}: {
  pending: boolean
  onClose: () => void
  submitLabel: string
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" className={ghost} onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className={btn} disabled={pending}>
        {pending ? 'Working...' : submitLabel}
      </button>
    </div>
  )
}
