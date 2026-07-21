'use client'

import type { AccountRecord } from '@triyara/db'
import { RELATIONSHIP_STATUSES } from '@triyara/validation'
import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'

import {
  type ActionState,
  bulkStatusAction,
  createAccountAction,
  deleteAccountAction,
  restoreAccountAction,
  updateAccountAction,
} from './actions'

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

type Dialog =
  | { type: 'create' }
  | { type: 'edit'; account: AccountRecord }
  | { type: 'delete'; account: AccountRecord }
  | { type: 'restore'; account: AccountRecord }
  | null

export function AccountsView({
  accounts,
  nextCursor,
  hasMore,
  canWrite,
}: {
  accounts: AccountRecord[]
  nextCursor: string | null
  hasMore: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

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
        <h1 className="text-gold text-2xl font-bold">Accounts</h1>
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
        <BulkToolbar
          ids={[...selected]}
          onDone={() => {
            setSelected(new Set())
            router.refresh()
          }}
        />
      ) : null}

      {/* Table / empty */}
      {accounts.length === 0 ? (
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
          disabled={!hasMore || !nextCursor}
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
          account={dialog.account}
          action={deleteAccountAction}
          onClose={() => setDialog(null)}
        />
      ) : dialog?.type === 'restore' ? (
        <ConfirmDialog
          title="Restore account"
          body={`Restore "${dialog.account.legalName}"?`}
          account={dialog.account}
          action={restoreAccountAction}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-navy-elevated w-full max-w-md rounded-2xl border border-white/10 p-6">
        <h2 className="text-gold text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function useCloseOnOk(state: ActionState, onClose: () => void) {
  const router = useRouter()
  useEffect(() => {
    if (state.ok && !state.error) {
      onClose()
      router.refresh()
    }
  }, [state, onClose, router])
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(createAccountAction, {})
  useCloseOnOk(state, onClose)
  return (
    <Modal title="New account">
      <form action={action} className="space-y-3">
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
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        <DialogButtons pending={pending} onClose={onClose} submitLabel="Create" />
      </form>
    </Modal>
  )
}

function EditDialog({ account, onClose }: { account: AccountRecord; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateAccountAction, {})
  useCloseOnOk(state, onClose)
  return (
    <Modal title="Edit account">
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={account.id} />
        <input type="hidden" name="version" value={account.version} />
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
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        <DialogButtons pending={pending} onClose={onClose} submitLabel="Save" />
      </form>
    </Modal>
  )
}

function ConfirmDialog({
  title,
  body,
  account,
  action,
  onClose,
}: {
  title: string
  body: string
  account: AccountRecord
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  onClose: () => void
}) {
  const [state, formAction, pending] = useActionState(action, {})
  useCloseOnOk(state, onClose)
  return (
    <Modal title={title}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={account.id} />
        <input type="hidden" name="version" value={account.version} />
        <p className="text-sm text-white/60">{body}</p>
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        <DialogButtons pending={pending} onClose={onClose} submitLabel="Confirm" />
      </form>
    </Modal>
  )
}

function BulkToolbar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(bulkStatusAction, {})
  useEffect(() => {
    if (state.ok) onDone()
  }, [state, onDone])
  return (
    <form
      action={action}
      className="border-gold/25 bg-gold/[0.06] mt-4 flex items-center gap-3 rounded-lg border px-4 py-2"
    >
      <input type="hidden" name="ids" value={ids.join(',')} />
      <span className="text-gold text-sm">{ids.length} selected</span>
      <select name="relationshipStatus" defaultValue="ACTIVE" className={`${field} w-40`}>
        {RELATIONSHIP_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button className={ghost} disabled={pending}>
        Apply status
      </button>
      {state.error ? <span className="text-sm text-red-400">{state.error}</span> : null}
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
