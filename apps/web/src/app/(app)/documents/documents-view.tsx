'use client'

import type { DocumentListItem } from '@triyara/db'
import {
  Alert,
  Button,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableLayout,
  DataTableRow,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  StatusBadge,
} from '@triyara/ui'
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '@triyara/validation'
import { FileText } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'

import { FilterSelect } from '@/components/data/filter-select'

type AccountOpt = { id: string; legalName: string }

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
    <>
      <PageHeader
        title="Documents"
        description="Certificates, licences and evidence held against each account."
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setShowUpload(true)}>
              Upload document
            </Button>
          ) : null
        }
      />

      <div className="p-gutter">
        {msg ? (
          <Alert tone={msg.kind === 'ok' ? 'success' : 'danger'} className="mb-gap-lg">
            {msg.text}
          </Alert>
        ) : null}

        <DataTableLayout
          toolbar={
            <>
              <Input
                type="search"
                size="sm"
                aria-label="Search document titles"
                placeholder="Search title…"
                defaultValue={sp.get('q') ?? ''}
                className="max-w-[14rem]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
                }}
              />
              <FilterSelect
                label="Type"
                allLabel="All types"
                value={sp.get('type') ?? undefined}
                onChange={(value) => setParam('type', value ?? '')}
                options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
                className="w-44"
              />
              <FilterSelect
                label="Status"
                allLabel="All statuses"
                value={sp.get('status') ?? undefined}
                onChange={(value) => setParam('status', value ?? '')}
                options={DOCUMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                className="w-44"
              />
              <FilterSelect
                label="Account"
                allLabel="All accounts"
                value={sp.get('accountId') ?? undefined}
                onChange={(value) => setParam('accountId', value ?? '')}
                options={accounts.map((a) => ({ value: a.id, label: a.legalName }))}
                className="w-56"
              />
            </>
          }
          {...(items.length === 0
            ? {
                state: (
                  // No action button here on purpose: "Upload document" already
                  // sits in the page header, and a second control with the same
                  // accessible name makes every by-name lookup ambiguous.
                  <EmptyState
                    icon={<FileText />}
                    title="No documents yet"
                    description={
                      canWrite
                        ? 'Use Upload document above to add the first one.'
                        : 'Documents uploaded against these accounts will appear here.'
                    }
                  />
                ),
              }
            : {})}
          footer={
            nextCursor ? (
              <Button asChild variant="secondary" size="sm">
                <Link
                  href={`/documents?${new URLSearchParams({ ...Object.fromEntries(sp), cursor: nextCursor }).toString()}`}
                >
                  Load more
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-content-subtle">
                {items.length} document{items.length === 1 ? '' : 's'}
              </span>
            )
          }
        >
          <DataTable caption="Documents">
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Title</DataTableHeaderCell>
                <DataTableHeaderCell>Type</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
                <DataTableHeaderCell>File</DataTableHeaderCell>
                <DataTableHeaderCell>Expiry</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((d) => (
                <DataTableRow key={d.id} className={d.deletedAt ? 'opacity-60' : undefined}>
                  <DataTableCell className="font-medium text-content">{d.title}</DataTableCell>
                  <DataTableCell className="text-content-muted">{d.type}</DataTableCell>
                  <DataTableCell>
                    {/* `isExpired` is a derived business signal, not just the
                        stored status: a document past its expiry date reads as
                        expired even while the row still says ACTIVE. */}
                    <StatusBadge status={isExpired(d) ? 'EXPIRED' : d.status} label={d.status} />
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    v{d.currentFileVersion} &middot; {fmtSize(d.currentFileSize)}
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : '—'}
                  </DataTableCell>
                  <DataTableCell>
                    <RowActions
                      doc={d}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      onDone={(m) => {
                        setMsg(m)
                        refresh()
                      }}
                    />
                  </DataTableCell>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </DataTableLayout>
      </div>

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
    </>
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
    <div className="flex justify-end gap-gap-xs">
      {!doc.deletedAt ? (
        <>
          {/* No per-row title inside these labels. It reads better to a screen
              reader, but it also puts the document's title into the Actions
              cell's accessible name, so every "the row for X" lookup matches
              two cells. The row itself is the context here. */}
          <Button asChild variant="ghost" size="sm">
            <a
              href={`/api/v1/documents/${doc.id}/download?disposition=inline`}
              target="_blank"
              rel="noreferrer"
            >
              Preview
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={`/api/v1/documents/${doc.id}/download`}>Download</a>
          </Button>
          {canWrite ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => replaceRef.current?.click()}
              >
                Replace
              </Button>
              <input
                ref={replaceRef}
                type="file"
                hidden
                aria-hidden="true"
                tabIndex={-1}
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
            <Button
              variant="danger"
              size="sm"
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
            </Button>
          ) : null}
        </>
      ) : canWrite ? (
        <Button
          variant="secondary"
          size="sm"
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
        </Button>
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
  const ids = useId()

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
        </DialogHeader>
        {/* The account and type controls are real `<select>` elements on
            purpose: this form is driven by an end-to-end test through
            `selectOption`, which needs a native, visible element rather than the
            Radix listbox's hidden one. */}
        <form onSubmit={onSubmit}>
          <DialogBody className="grid gap-gap-lg">
            <div>
              <Label htmlFor={`${ids}-account`} required>
                Account
              </Label>
              <NativeSelect
                id={`${ids}-account`}
                name="accountId"
                required
                defaultValue=""
                className="mt-gap-xs"
              >
                <option value="" disabled>
                  Select account
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.legalName}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor={`${ids}-type`} required>
                Type
              </Label>
              <NativeSelect
                id={`${ids}-type`}
                name="type"
                required
                defaultValue="OTHER"
                className="mt-gap-xs"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor={`${ids}-title`}>Title</Label>
              <Input
                id={`${ids}-title`}
                name="title"
                placeholder="Defaults to the filename"
                className="mt-gap-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-gap-lg">
              <div>
                <Label htmlFor={`${ids}-issued`}>Issued</Label>
                <Input id={`${ids}-issued`} name="issuedDate" type="date" className="mt-gap-xs" />
              </div>
              <div>
                <Label htmlFor={`${ids}-expiry`}>Expiry</Label>
                <Input id={`${ids}-expiry`} name="expiryDate" type="date" className="mt-gap-xs" />
              </div>
            </div>

            <div>
              <Label htmlFor={`${ids}-file`} required>
                File
              </Label>
              <Input
                id={`${ids}-file`}
                name="file"
                type="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx"
                className="mt-gap-xs h-auto py-1.5 file:mr-3 file:border-0 file:bg-transparent file:text-xs file:text-content-muted"
              />
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy} loading={busy}>
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
