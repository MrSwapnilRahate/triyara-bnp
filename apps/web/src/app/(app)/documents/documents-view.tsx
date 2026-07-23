'use client'

import type { DocumentListItem } from '@triyara/db'
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

type AccountOpt = { id: string; legalName: string }

const field =
  'rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gold/60 focus:outline-none'
const btn =
  'rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'
const ghost =
  'rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white disabled:opacity-50'

/* ---------- API client ---------- */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success) {
    throw new Error(body?.errors?.[0]?.message ?? `Request failed (${res.status})`)
  }
  return body.data as T
}

interface Presigned {
  uploadUrl: string
  method: string
  headers: Record<string, string>
  storageKey: string
}

async function putFile(presigned: Presigned, file: File): Promise<void> {
  const res = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: presigned.headers,
    body: file,
  })
  if (!res.ok) throw new Error('File upload to storage failed')
}

/* ---------- helpers ---------- */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function isExpired(item: DocumentListItem): boolean {
  return item.status === 'EXPIRED' || (!!item.expiryDate && new Date(item.expiryDate) < new Date())
}

export function DocumentsView({
  items,
  nextCursor,
  accounts,
  canWrite,
  canDelete,
}: {
  items: DocumentListItem[]
  nextCursor: string | null
  accounts: AccountOpt[]
  canWrite: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [showUpload, setShowUpload] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [, startTransition] = useTransition()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('cursor')
    startTransition(() => router.push(`/documents?${next.toString()}`))
  }

  function refresh() {
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-gold text-2xl font-bold">Documents</h1>
        {canWrite ? (
          <button className={btn} onClick={() => setShowUpload(true)}>
            Upload document
          </button>
        ) : null}
      </div>

      {msg ? (
        <p className={`mt-3 text-sm ${msg.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {msg.text}
        </p>
      ) : null}

      {/* Filters */}
      <div className="mt-5 flex flex-wrap gap-2">
        <input
          className={field}
          placeholder="Search title..."
          defaultValue={sp.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
          }}
        />
        <select
          className={field}
          defaultValue={sp.get('type') ?? ''}
          onChange={(e) => setParam('type', e.target.value)}
        >
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className={field}
          defaultValue={sp.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={field}
          defaultValue={sp.get('accountId') ?? ''}
          onChange={(e) => setParam('accountId', e.target.value)}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.legalName}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                  No documents yet. {canWrite ? 'Upload the first one.' : ''}
                </td>
              </tr>
            ) : (
              items.map((d) => (
                <tr
                  key={d.id}
                  className={`border-t border-white/5 ${d.deletedAt ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 text-white">{d.title}</td>
                  <td className="px-4 py-3 text-white/60">{d.type}</td>
                  <td className="px-4 py-3">
                    <span className={isExpired(d) ? 'text-red-400' : 'text-white/60'}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    v{d.currentFileVersion} &middot; {fmtSize(d.currentFileSize)}
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      doc={d}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      onDone={(m) => {
                        setMsg(m)
                        refresh()
                      }}
                    />
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
            href={`/documents?${new URLSearchParams({ ...Object.fromEntries(sp), cursor: nextCursor }).toString()}`}
            className={ghost}
          >
            Load more
          </Link>
        </div>
      ) : null}

      {showUpload ? (
        <UploadDialog
          accounts={accounts}
          onClose={() => setShowUpload(false)}
          onDone={(m) => {
            setShowUpload(false)
            setMsg(m)
            refresh()
          }}
        />
      ) : null}
    </div>
  )
}

/* ---------- Row actions ---------- */
function RowActions({
  doc,
  canWrite,
  canDelete,
  onDone,
}: {
  doc: DocumentListItem
  canWrite: boolean
  canDelete: boolean
  onDone: (m: { kind: 'ok' | 'err'; text: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  const replaceRef = useRef<HTMLInputElement>(null)

  async function run(fn: () => Promise<void>, okText: string) {
    setBusy(true)
    try {
      await fn()
      onDone({ kind: 'ok', text: okText })
    } catch (e) {
      onDone({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setBusy(false)
    }
  }

  async function onReplace(file: File) {
    // presign needs accountId + type (reuse the document's)
    const pres = await api<Presigned>('/api/v1/documents/presign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        accountId: doc.accountId,
        type: doc.type,
      }),
    })
    await putFile(pres, file)
    await api(`/api/v1/documents/${doc.id}/version`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'if-match': `v${doc.version}` },
      body: JSON.stringify({
        storageKey: pres.storageKey,
        mimeType: file.type,
        originalFilename: file.name,
      }),
    })
  }

  return (
    <div className="flex justify-end gap-2">
      {!doc.deletedAt ? (
        <>
          <a
            className={ghost}
            href={`/api/v1/documents/${doc.id}/download?disposition=inline`}
            target="_blank"
            rel="noreferrer"
          >
            Preview
          </a>
          <a className={ghost} href={`/api/v1/documents/${doc.id}/download`}>
            Download
          </a>
          {canWrite ? (
            <>
              <button className={ghost} disabled={busy} onClick={() => replaceRef.current?.click()}>
                Replace
              </button>
              <input
                ref={replaceRef}
                type="file"
                hidden
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file)
                    void run(() => onReplace(file), `New version of "${doc.title}" uploaded`)
                }}
              />
            </>
          ) : null}
          {canDelete ? (
            <button
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    api(`/api/v1/documents/${doc.id}`, {
                      method: 'DELETE',
                      headers: { 'if-match': `v${doc.version}` },
                    }),
                  `Deleted "${doc.title}"`,
                )
              }
            >
              Delete
            </button>
          ) : null}
        </>
      ) : canWrite ? (
        <button
          className={ghost}
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                api(`/api/v1/documents/${doc.id}/restore`, {
                  method: 'POST',
                  headers: { 'if-match': `v${doc.version}` },
                }),
              `Restored "${doc.title}"`,
            )
          }
        >
          Restore
        </button>
      ) : null}
    </div>
  )
}

/* ---------- Upload dialog ---------- */
function UploadDialog({
  accounts,
  onClose,
  onDone,
}: {
  accounts: AccountOpt[]
  onClose: () => void
  onDone: (m: { kind: 'ok' | 'err'; text: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const file = fd.get('file') as File | null
    const accountId = String(fd.get('accountId') ?? '')
    const type = String(fd.get('type') ?? '')
    const title = String(fd.get('title') ?? '').trim() || (file?.name ?? 'Document')
    const issuedDate = String(fd.get('issuedDate') ?? '') || undefined
    const expiryDate = String(fd.get('expiryDate') ?? '') || undefined

    if (!file || file.size === 0) return setError('Choose a file')
    if (!accountId) return setError('Choose an account')

    setBusy(true)
    try {
      const pres = await api<Presigned>('/api/v1/documents/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          accountId,
          type,
        }),
      })
      await putFile(pres, file)
      await api('/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          storageKey: pres.storageKey,
          accountId,
          type,
          title,
          mimeType: file.type,
          originalFilename: file.name,
          issuedDate,
          expiryDate,
        }),
      })
      onDone({ kind: 'ok', text: `Uploaded "${title}"` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="bg-navy-elevated w-full max-w-md rounded-2xl border border-white/10 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-gold text-lg font-bold">Upload document</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <select name="accountId" required className={`${field} w-full`} defaultValue="">
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.legalName}
              </option>
            ))}
          </select>
          <select name="type" required className={`${field} w-full`} defaultValue="OTHER">
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            name="title"
            placeholder="Title (defaults to filename)"
            className={`${field} w-full`}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-white/40">
              Issued
              <input name="issuedDate" type="date" className={`${field} mt-1 w-full`} />
            </label>
            <label className="text-xs text-white/40">
              Expiry
              <input name="expiryDate" type="date" className={`${field} mt-1 w-full`} />
            </label>
          </div>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx"
            className={`${field} w-full`}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={ghost} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={btn} disabled={busy}>
              {busy ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
