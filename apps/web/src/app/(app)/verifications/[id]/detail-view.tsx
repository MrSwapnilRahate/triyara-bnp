'use client'

import type { ReviewerOption, VerificationHistoryItem, VerificationRecord } from '@triyara/db'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type DocItem = {
  id: string
  title: string
  type: string
  status: string
  expiryDate: Date | string | null
}

const field =
  'w-full rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white focus:border-gold/60 focus:outline-none'
const btn =
  'rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'
const ghost =
  'rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white disabled:opacity-50'

async function api(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, { credentials: 'include', ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success)
    throw new Error(body?.errors?.[0]?.message ?? `Failed (${res.status})`)
}

type DialogKind = 'assign' | 'request' | 'approve' | 'reject' | 'suspend' | null

export function VerificationDetail({
  verification: v,
  accountName,
  documents,
  history,
  reviewers,
  canVerify,
  canUpdate,
  canNote,
}: {
  verification: VerificationRecord
  accountName: string
  documents: DocItem[]
  history: VerificationHistoryItem[]
  reviewers: ReviewerOption[]
  canVerify: boolean
  canUpdate: boolean
  canNote: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const ifMatch = { 'if-match': `v${v.version}` }

  async function run(fn: () => Promise<void>, okText: string) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setDialog(null)
      setMsg({ kind: 'ok', text: okText })
      router.refresh()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setBusy(false)
    }
  }

  const post = (path: string, payload?: unknown) =>
    api(`/api/v1/verifications/${v.id}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ifMatch },
      body: payload ? JSON.stringify(payload) : undefined,
    })

  const acceptedTypes = new Set(
    v.reviews.filter((r) => r.status === 'ACCEPTED').map((r) => r.documentType),
  )
  const reviewByDoc = new Map(v.reviews.map((r) => [r.documentId, r.status]))
  const s = v.status

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/verifications" className="text-xs text-white/40 hover:text-gold">
        &larr; Verification queue
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gold">{accountName}</h1>
          <p className="text-sm text-white/40">
            Status <span className="font-semibold text-white">{s}</span>
            {v.decision ? <> &middot; {v.decision}</> : null}
            {v.expiresAt ? (
              <> &middot; valid to {new Date(v.expiresAt).toLocaleDateString()}</>
            ) : null}
          </p>
        </div>
      </div>
      {msg ? (
        <p className={`mt-2 text-sm ${msg.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {msg.text}
        </p>
      ) : null}

      {/* Action bar */}
      <div className="mt-5 flex flex-wrap gap-2">
        {canUpdate && (s === 'DRAFT' || s === 'DOCUMENTS_REQUESTED') ? (
          <button
            className={btn}
            disabled={busy}
            onClick={() => void run(() => post('/submit'), 'Submitted for review')}
          >
            Submit
          </button>
        ) : null}
        {canUpdate && ['PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW'].includes(s) ? (
          <button className={ghost} onClick={() => setDialog('assign')}>
            Assign reviewer
          </button>
        ) : null}
        {canUpdate && ['PENDING_REVIEW', 'IN_REVIEW'].includes(s) ? (
          <button className={ghost} onClick={() => setDialog('request')}>
            Request documents
          </button>
        ) : null}
        {canVerify && s === 'IN_REVIEW' ? (
          <button className={btn} onClick={() => setDialog('approve')}>
            Approve
          </button>
        ) : null}
        {canVerify && ['PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW'].includes(s) ? (
          <button
            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
            onClick={() => setDialog('reject')}
          >
            Reject
          </button>
        ) : null}
        {canVerify && s === 'VERIFIED' ? (
          <button className={ghost} onClick={() => setDialog('suspend')}>
            Suspend
          </button>
        ) : null}
        {canUpdate && ['SUSPENDED', 'REJECTED', 'EXPIRED'].includes(s) ? (
          <button
            className={ghost}
            disabled={busy}
            onClick={() => void run(() => post('/reopen'), 'Reopened')}
          >
            Reopen
          </button>
        ) : null}
      </div>

      {/* Required documents checklist */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white">Required documents</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {v.requiredDocumentTypes.map((t) => (
            <span
              key={t}
              className={`rounded-full border px-3 py-1 text-xs ${acceptedTypes.has(t) ? 'border-green-500/40 text-green-400' : 'border-white/15 text-white/50'}`}
            >
              {t} {acceptedTypes.has(t) ? '✓' : ''}
            </span>
          ))}
        </div>

        <h2 className="mt-6 text-sm font-semibold text-white">
          Document checklist ({documents.length})
        </h2>
        <ul className="mt-2 space-y-2">
          {documents.length === 0 ? (
            <li className="text-sm text-white/40">
              This account has no documents. Upload them under Documents.
            </li>
          ) : null}
          {documents.map((d) => {
            const state = reviewByDoc.get(d.id) ?? 'PENDING'
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
              >
                <span className="text-white">
                  <span className="text-white/40">[{d.type}]</span> {d.title}
                  <span
                    className={`ml-2 text-xs ${state === 'ACCEPTED' ? 'text-green-400' : state === 'REJECTED' ? 'text-red-400' : 'text-white/40'}`}
                  >
                    {state}
                  </span>
                </span>
                {canVerify && ['IN_REVIEW', 'PENDING_REVIEW', 'DOCUMENTS_REQUESTED'].includes(s) ? (
                  <span className="flex gap-2">
                    <a
                      className={ghost}
                      href={`/api/v1/documents/${d.id}/download?disposition=inline`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                    <button
                      className={ghost}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => post('/review-document', { documentId: d.id, status: 'ACCEPTED' }),
                          'Marked accepted',
                        )
                      }
                    >
                      Accept
                    </button>
                    <button
                      className={ghost}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => post('/review-document', { documentId: d.id, status: 'REJECTED' }),
                          'Marked rejected',
                        )
                      }
                    >
                      Reject
                    </button>
                  </span>
                ) : (
                  <a
                    className={ghost}
                    href={`/api/v1/documents/${d.id}/download?disposition=inline`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Notes */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white">Review notes</h2>
        {canNote ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('body') as HTMLInputElement
              const body = input.value.trim()
              if (body)
                void run(() => post('/notes', { body }), 'Note added').then(
                  () => (input.value = ''),
                )
            }}
          >
            <input name="body" placeholder="Add a note..." className={field} />
            <button className={btn} disabled={busy}>
              Add
            </button>
          </form>
        ) : null}
        <ul className="mt-3 space-y-2">
          {v.notes.length === 0 ? <li className="text-sm text-white/40">No notes yet.</li> : null}
          {v.notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70"
            >
              {n.body}
              <span className="ml-2 text-xs text-white/30">
                {new Date(n.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* History timeline */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white">History</h2>
        <ol className="mt-3 space-y-2 border-l border-white/10 pl-4">
          {history.map((h) => (
            <li key={h.id} className="relative text-sm text-white/60">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gold" />
              <span className="text-white">{h.toStatus}</span>
              <span className="text-white/30">
                {' '}
                &middot; {h.action.replace('verification.', '')}
              </span>
              {h.reason ? <span className="text-white/40"> &middot; {h.reason}</span> : null}
              <span className="ml-2 text-xs text-white/30">
                {new Date(h.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Dialogs */}
      {dialog ? (
        <Modal onClose={() => setDialog(null)}>
          {dialog === 'assign' ? (
            <DialogForm
              title="Assign reviewer"
              submitLabel="Assign"
              busy={busy}
              onSubmit={(fd) =>
                void run(
                  () => post('/assign', { reviewerId: String(fd.get('reviewerId')) }),
                  'Reviewer assigned',
                )
              }
            >
              <select name="reviewerId" required className={field} defaultValue="">
                <option value="" disabled>
                  Select reviewer
                </option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.roleNames.join('/')})
                  </option>
                ))}
              </select>
            </DialogForm>
          ) : null}
          {dialog === 'request' ? (
            <DialogForm
              title="Request documents"
              submitLabel="Request"
              busy={busy}
              onSubmit={(fd) =>
                void run(
                  () => post('/request-documents', { reason: String(fd.get('reason')) }),
                  'Documents requested',
                )
              }
            >
              <textarea
                name="reason"
                required
                placeholder="What is needed?"
                className={field}
                rows={3}
              />
            </DialogForm>
          ) : null}
          {dialog === 'approve' ? (
            <DialogForm
              title="Approve verification"
              submitLabel="Approve"
              busy={busy}
              onSubmit={(fd) =>
                void run(
                  () => post('/approve', { expiresInDays: Number(fd.get('expiresInDays')) || 365 }),
                  'Verification approved',
                )
              }
            >
              <label className="text-xs text-white/40">
                Valid for (days)
                <input
                  name="expiresInDays"
                  type="number"
                  defaultValue={365}
                  className={`${field} mt-1`}
                />
              </label>
            </DialogForm>
          ) : null}
          {dialog === 'reject' ? (
            <DialogForm
              title="Reject verification"
              submitLabel="Reject"
              busy={busy}
              onSubmit={(fd) =>
                void run(
                  () => post('/reject', { reason: String(fd.get('reason')) }),
                  'Verification rejected',
                )
              }
            >
              <textarea
                name="reason"
                required
                placeholder="Reason for rejection"
                className={field}
                rows={3}
              />
            </DialogForm>
          ) : null}
          {dialog === 'suspend' ? (
            <DialogForm
              title="Suspend verification"
              submitLabel="Suspend"
              busy={busy}
              onSubmit={(fd) =>
                void run(
                  () => post('/suspend', { reason: String(fd.get('reason')) }),
                  'Verification suspended',
                )
              }
            >
              <textarea
                name="reason"
                required
                placeholder="Reason for suspension"
                className={field}
                rows={3}
              />
            </DialogForm>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function DialogForm({
  title,
  submitLabel,
  busy,
  onSubmit,
  children,
}: {
  title: string
  submitLabel: string
  busy: boolean
  onSubmit: (fd: FormData) => void
  children: React.ReactNode
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new FormData(e.currentTarget))
      }}
    >
      <h2 className="text-lg font-bold text-gold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
      <div className="mt-5 flex justify-end">
        <button className={btn} disabled={busy}>
          {busy ? 'Working...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
