'use client'

import type { ReviewerOption, VerificationHistoryItem, VerificationRecord } from '@triyara/db'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  StatusBadge,
  Textarea,
} from '@triyara/ui'
import { ChevronLeft } from 'lucide-react'
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

/** What a mutation answered with. Every route here returns the updated record. */
type MutationResult = { version?: number } | null

async function api(url: string, init: RequestInit): Promise<MutationResult> {
  const res = await fetch(url, { credentials: 'include', ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success)
    throw new Error(body?.errors?.[0]?.message ?? `Failed (${res.status})`)
  // The envelope was being thrown away, which is where the stale version came
  // from: the new one was in this response all along.
  return (body.data ?? null) as MutationResult
}

type DialogKind = 'assign' | 'request' | 'approve' | 'reject' | 'suspend' | null

const DIALOG_TITLE: Record<Exclude<DialogKind, null>, string> = {
  assign: 'Assign reviewer',
  request: 'Request documents',
  approve: 'Approve verification',
  reject: 'Reject verification',
  suspend: 'Suspend verification',
}

const DIALOG_SUBMIT: Record<Exclude<DialogKind, null>, string> = {
  assign: 'Assign',
  request: 'Request',
  approve: 'Approve',
  reject: 'Reject',
  suspend: 'Suspend',
}

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

  /**
   * The version the next request will claim to have seen.
   *
   * It used to be `v.version` alone - the number the server rendered this page
   * with. A mutation increments it, so between a successful action and the
   * refreshed tree arriving, this component was still offering the old one. Act
   * twice quickly and the second request said "I have seen v3" about a record
   * already at v4, and the server correctly refused it: 412, "Precondition
   * failed (stale version)", for an action that should simply have worked.
   *
   * Every mutation route already answers with the updated record, so the
   * authoritative number is in the response we make. Adopting it there means
   * correctness no longer waits on `router.refresh()`, which is a display
   * concern and, as we learned the hard way, not something to depend on.
   *
   * The newer of the two wins. Our own mutation is ahead while a refresh is in
   * flight; a refresh carrying somebody else's change is ahead of us. What this
   * deliberately does not do is invent a version: if another actor moved the
   * record and we have not seen it, we still send what we last knew and still
   * get the 412 we should.
   */
  const [adopted, setAdopted] = useState(v.version)
  const version = Math.max(adopted, v.version)
  const ifMatch = { 'if-match': `v${version}` }

  async function run(fn: () => Promise<MutationResult>, okText: string) {
    setBusy(true)
    setMsg(null)
    try {
      const updated = await fn()
      // Before anything is re-enabled, so no control can be used against a
      // version this component has already superseded.
      if (typeof updated?.version === 'number') setAdopted(updated.version)
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

  function onDialogSubmit(fd: FormData) {
    if (dialog === 'assign')
      void run(
        () => post('/assign', { reviewerId: String(fd.get('reviewerId')) }),
        'Reviewer assigned',
      )
    if (dialog === 'request')
      void run(
        () => post('/request-documents', { reason: String(fd.get('reason')) }),
        'Documents requested',
      )
    if (dialog === 'approve')
      void run(
        () => post('/approve', { expiresInDays: Number(fd.get('expiresInDays')) || 365 }),
        'Verification approved',
      )
    if (dialog === 'reject')
      void run(() => post('/reject', { reason: String(fd.get('reason')) }), 'Verification rejected')
    if (dialog === 'suspend')
      void run(
        () => post('/suspend', { reason: String(fd.get('reason')) }),
        'Verification suspended',
      )
  }

  const meta: Array<{ label: string; value: React.ReactNode }> = []
  if (v.decision) meta.push({ label: 'Decision', value: v.decision })
  if (v.expiresAt)
    meta.push({ label: 'Valid to', value: new Date(v.expiresAt).toLocaleDateString() })

  return (
    <>
      <PageHeader
        title={accountName}
        status={<StatusBadge status={s} />}
        breadcrumb={
          <Link
            href="/verifications"
            className="focus-ring inline-flex items-center gap-gap-xs text-xs text-content-muted hover:text-content"
          >
            <ChevronLeft aria-hidden="true" className="size-3.5" />
            Verification queue
          </Link>
        }
        {...(meta.length > 0 ? { meta } : {})}
        actions={
          <>
            {canUpdate && (s === 'DRAFT' || s === 'DOCUMENTS_REQUESTED') ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void run(() => post('/submit'), 'Submitted for review')}
              >
                Submit
              </Button>
            ) : null}
            {canUpdate && ['PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW'].includes(s) ? (
              <Button variant="secondary" onClick={() => setDialog('assign')}>
                Assign reviewer
              </Button>
            ) : null}
            {canUpdate && ['PENDING_REVIEW', 'IN_REVIEW'].includes(s) ? (
              <Button variant="secondary" onClick={() => setDialog('request')}>
                Request documents
              </Button>
            ) : null}
            {canVerify && s === 'IN_REVIEW' ? (
              <Button variant="primary" onClick={() => setDialog('approve')}>
                Approve
              </Button>
            ) : null}
            {canVerify && ['PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW'].includes(s) ? (
              <Button variant="danger" onClick={() => setDialog('reject')}>
                Reject
              </Button>
            ) : null}
            {canVerify && s === 'VERIFIED' ? (
              <Button variant="secondary" onClick={() => setDialog('suspend')}>
                Suspend
              </Button>
            ) : null}
            {canUpdate && ['SUSPENDED', 'REJECTED', 'EXPIRED'].includes(s) ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run(() => post('/reopen'), 'Reopened')}
              >
                Reopen
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mx-auto flex max-w-4xl flex-col gap-gutter p-gutter">
        {msg ? <Alert tone={msg.kind === 'ok' ? 'success' : 'danger'}>{msg.text}</Alert> : null}

        <Card>
          <CardHeader>
            <CardTitle as="h2">Required documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-gap">
              {v.requiredDocumentTypes.map((t) => (
                <li key={t}>
                  <Badge tone={acceptedTypes.has(t) ? 'success' : 'neutral'} variant="outline">
                    {t}
                    {acceptedTypes.has(t) ? <span className="sr-only"> accepted</span> : null}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Document checklist ({documents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-base text-content-muted">
                This account has no documents. Upload them under Documents.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {documents.map((d) => {
                  const state = reviewByDoc.get(d.id) ?? 'PENDING'
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-gap py-gap"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-gap">
                        <span className="font-mono text-xs text-content-subtle">{d.type}</span>
                        <span className="truncate text-base text-content">{d.title}</span>
                        <StatusBadge status={state} size="sm" />
                      </span>
                      {canVerify &&
                      ['IN_REVIEW', 'PENDING_REVIEW', 'DOCUMENTS_REQUESTED'].includes(s) ? (
                        <span className="flex shrink-0 gap-gap-xs">
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={`/api/v1/documents/${d.id}/download?disposition=inline`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  post('/review-document', {
                                    documentId: d.id,
                                    status: 'ACCEPTED',
                                  }),
                                'Marked accepted',
                              )
                            }
                          >
                            Accept
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  post('/review-document', {
                                    documentId: d.id,
                                    status: 'REJECTED',
                                  }),
                                'Marked rejected',
                              )
                            }
                          >
                            Reject
                          </Button>
                        </span>
                      ) : (
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={`/api/v1/documents/${d.id}/download?disposition=inline`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </a>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Review notes</CardTitle>
          </CardHeader>
          <CardContent>
            {canNote ? (
              <form
                className="mb-gap-lg flex gap-gap"
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
                <Label htmlFor="verification-note" className="sr-only">
                  Add a note
                </Label>
                <Input id="verification-note" name="body" placeholder="Add a note…" />
                <Button variant="primary" disabled={busy}>
                  Add
                </Button>
              </form>
            ) : null}
            {v.notes.length === 0 ? (
              <p className="text-base text-content-muted">No notes yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {v.notes.map((n) => (
                  <li key={n.id} className="py-gap">
                    <p className="text-base text-content">{n.body}</p>
                    <p className="mt-0.5 text-xs text-content-subtle">
                      <time dateTime={new Date(n.createdAt).toISOString()}>
                        {new Date(n.createdAt).toLocaleString()}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-gap-lg border-l border-line pl-gap-lg">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-accent"
                  />
                  <p className="flex flex-wrap items-baseline gap-gap-xs">
                    <span className="text-base font-medium text-content">{h.toStatus}</span>
                    <span className="text-xs text-content-subtle">
                      {h.action.replace('verification.', '')}
                    </span>
                  </p>
                  {h.reason ? (
                    <p className="mt-0.5 text-xs text-content-muted">{h.reason}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-content-subtle">
                    <time dateTime={new Date(h.createdAt).toISOString()}>
                      {new Date(h.createdAt).toLocaleString()}
                    </time>
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          {dialog ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                onDialogSubmit(new FormData(e.currentTarget))
              }}
            >
              <DialogHeader>
                <DialogTitle>{DIALOG_TITLE[dialog]}</DialogTitle>
              </DialogHeader>
              <DialogBody className="grid gap-gap-lg">
                {dialog === 'assign' ? (
                  <>
                    <Label htmlFor="assign-reviewer" required>
                      Reviewer
                    </Label>
                    {/* A real <select>, not the Radix listbox. Radix would work -
                        it renders a hidden native element so the FormData
                        contract holds - but it is the only thing that would pull
                        the whole Select primitive into this route, and this page
                        is already the heaviest in the module. A reviewer picker
                        is a plain list of names; it does not need a combobox. */}
                    <NativeSelect id="assign-reviewer" name="reviewerId" required defaultValue="">
                      <option value="" disabled>
                        Select reviewer
                      </option>
                      {reviewers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.roleNames.join('/')})
                        </option>
                      ))}
                    </NativeSelect>
                  </>
                ) : null}

                {dialog === 'request' ? (
                  <>
                    <Label htmlFor="request-reason" required>
                      What is needed?
                    </Label>
                    <Textarea id="request-reason" name="reason" required rows={3} />
                  </>
                ) : null}

                {dialog === 'approve' ? (
                  <>
                    <Label htmlFor="approve-days">Valid for (days)</Label>
                    <Input
                      id="approve-days"
                      name="expiresInDays"
                      type="number"
                      defaultValue={365}
                    />
                  </>
                ) : null}

                {dialog === 'reject' ? (
                  <>
                    <Label htmlFor="reject-reason" required>
                      Reason for rejection
                    </Label>
                    <Textarea id="reject-reason" name="reason" required rows={3} />
                  </>
                ) : null}

                {dialog === 'suspend' ? (
                  <>
                    <Label htmlFor="suspend-reason" required>
                      Reason for suspension
                    </Label>
                    <Textarea id="suspend-reason" name="reason" required rows={3} />
                  </>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  variant={dialog === 'reject' ? 'danger' : 'primary'}
                  disabled={busy}
                  loading={busy}
                >
                  {DIALOG_SUBMIT[dialog]}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
