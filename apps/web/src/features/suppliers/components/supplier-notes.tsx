'use client'

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Label,
  PaginationControls,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Textarea,
} from '@triyara/ui'
import { MessageSquare } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { Can } from '@/lib/ability-context'

import {
  useAddSupplierNote,
  useDeleteSupplierNote,
  useSupplierNotes,
  useUpdateSupplierNote,
} from '../api/suppliers'
import { NOTE_SOURCE_LABELS, type SupplierNote, type SupplierNoteSource } from '../types'

const SOURCES = Object.keys(NOTE_SOURCE_LABELS) as SupplierNoteSource[]

/** Sentinel for "no channel", because Radix Select cannot hold an empty value. */
const NONE = '__none__'

/**
 * The supplier CRM timeline (§9).
 *
 * This is the screen that replaces scrolling back through WhatsApp: what was
 * said, who heard it, on which channel, newest first. Notes are deliberately
 * free text - MOQ, target price, payment terms and sample status arrive mixed
 * together in one message, and a form with a field per concept would lose
 * whichever concept nobody thought of.
 */
export function SupplierNotes({ supplierId }: { supplierId: string }) {
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<string>(NONE)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SupplierNote | null>(null)

  const query = useSupplierNotes(supplierId, {
    ...(cursor ? { cursor } : {}),
    ...(filter === NONE ? {} : { source: filter }),
  })
  const remove = useDeleteSupplierNote(supplierId)

  const items = query.data?.items ?? []
  const pagination = query.data?.meta.pagination

  function resetPaging() {
    setCursor(undefined)
    setCursorStack([])
  }

  let state: ReactNode
  if (query.isPending) state = <NotesSkeleton />
  else if (query.isError)
    state = <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
  else if (items.length === 0)
    state = (
      <EmptyState
        size="sm"
        icon={<MessageSquare />}
        title={filter === NONE ? 'No notes yet' : 'No notes on this channel'}
        description={
          filter === NONE
            ? 'Record what a supplier tells you — price, MOQ, lead time, terms — so nobody has to reopen the chat.'
            : 'Try a different channel, or clear the filter.'
        }
      />
    )

  return (
    <div className="max-w-3xl space-y-gutter">
      <Can action="update" subject="SupplierProfile">
        <NoteComposer supplierId={supplierId} onSaved={resetPaging} />
      </Can>

      <div className="flex items-center justify-between gap-gap-lg">
        <h3 className="text-sm font-medium text-content">Timeline</h3>
        <div className="flex items-center gap-gap">
          <Label htmlFor="note-filter" className="text-xs text-content-muted">
            Channel
          </Label>
          <Select
            value={filter}
            onValueChange={(next) => {
              setFilter(next)
              resetPaging()
            }}
          >
            <SelectTrigger id="note-filter" className="w-40" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All channels</SelectItem>
              {SOURCES.map((source) => (
                <SelectItem key={source} value={source}>
                  {NOTE_SOURCE_LABELS[source]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {state ? (
          <div className="p-gutter">{state}</div>
        ) : (
          <ol aria-label="Supplier notes, newest first">
            {items.map((note, index) => (
              <li key={note.id}>
                {index > 0 ? <Separator /> : null}
                {editingId === note.id ? (
                  <NoteEditor
                    supplierId={supplierId}
                    note={note}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <NoteRow
                    note={note}
                    onEdit={() => setEditingId(note.id)}
                    onDelete={() => setPendingDelete(note)}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
        <Separator />
        <PaginationControls
          count={items.length}
          limit={25}
          nextCursor={pagination?.nextCursor ?? null}
          onNext={() => {
            if (!pagination?.nextCursor) return
            setCursorStack((s) => [...s, cursor ?? ''])
            setCursor(pagination.nextCursor)
          }}
          onPrevious={() => {
            setCursorStack((s) => {
              const next = [...s]
              setCursor(next.pop() || undefined)
              return next
            })
          }}
          hasPrevious={cursorStack.length > 0}
          loading={query.isFetching}
        />
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete this note?"
        description="The note is removed from the timeline. This cannot be undone from here."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          if (!pendingDelete) return
          await remove.mutateAsync({ id: pendingDelete.id, version: pendingDelete.version })
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

function NoteComposer({ supplierId, onSaved }: { supplierId: string; onSaved: () => void }) {
  const [body, setBody] = useState('')
  const [source, setSource] = useState<string>(NONE)
  const add = useAddSupplierNote(supplierId)

  const trimmed = body.trim()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!trimmed) return
    try {
      await add.mutateAsync({
        body: trimmed,
        ...(source === NONE ? {} : { source: source as SupplierNoteSource }),
      })
    } catch {
      // The mutation already carries the error for display. Rethrowing here
      // would escape the submit handler as an unhandled rejection, and the
      // composer must keep the text the user typed so it can be retried.
      return
    }
    setBody('')
    setSource(NONE)
    // A new note is the newest note; showing page 3 would hide it.
    onSaved()
  }

  return (
    <Card className="p-0">
      <form onSubmit={submit} className="space-y-gap p-gutter">
        <div>
          <Label htmlFor="note-body" required>
            Add a note
          </Label>
          <Textarea
            id="note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={10_000}
            placeholder="What did they say? Price, MOQ, lead time, payment terms, sample status…"
            invalid={add.isError}
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-gap">
          <div className="space-y-gap-xs">
            <Label htmlFor="note-source" className="text-xs text-content-muted">
              Channel
            </Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="note-source" className="w-44" size="sm">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {SOURCES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {NOTE_SOURCE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={!trimmed} loading={add.isPending}>
            Save note
          </Button>
        </div>

        {add.isError ? (
          <p role="alert" className="text-xs text-danger">
            {add.error instanceof Error ? add.error.message : 'The note could not be saved.'}
          </p>
        ) : null}
      </form>
    </Card>
  )
}

function NoteEditor({
  supplierId,
  note,
  onDone,
}: {
  supplierId: string
  note: SupplierNote
  onDone: () => void
}) {
  const [body, setBody] = useState(note.body)
  const [source, setSource] = useState<string>(note.source ?? NONE)
  const update = useUpdateSupplierNote(supplierId)

  const trimmed = body.trim()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!trimmed) return
    try {
      await update.mutateAsync({
        id: note.id,
        version: note.version,
        dto: { body: trimmed, source: source === NONE ? null : (source as SupplierNoteSource) },
      })
    } catch {
      // Stay in the editor holding the user's text. A 412 means someone else
      // saved first, and closing here would discard this edit silently.
      return
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-gap px-gutter py-gap-lg">
      <Label htmlFor={`edit-${note.id}`} required>
        Edit note
      </Label>
      <Textarea
        id={`edit-${note.id}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={10_000}
        invalid={update.isError}
      />
      <div className="flex flex-wrap items-center justify-between gap-gap">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger aria-label="Channel" className="w-44" size="sm">
            <SelectValue placeholder="Not recorded" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not recorded</SelectItem>
            {SOURCES.map((option) => (
              <SelectItem key={option} value={option}>
                {NOTE_SOURCE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-gap">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!trimmed} loading={update.isPending}>
            Save
          </Button>
        </div>
      </div>
      {update.isError ? (
        <p role="alert" className="text-xs text-danger">
          {update.error instanceof Error ? update.error.message : 'The note could not be saved.'}
        </p>
      ) : null}
    </form>
  )
}

function NoteRow({
  note,
  onEdit,
  onDelete,
}: {
  note: SupplierNote
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <article className="px-gutter py-gap-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-gap">
        <div className="flex flex-wrap items-baseline gap-gap">
          <span className="text-sm font-medium text-content">
            {note.author?.name ?? 'Former team member'}
          </span>
          {note.source ? (
            <Badge size="sm" tone="neutral">
              {NOTE_SOURCE_LABELS[note.source]}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-gap">
          <time dateTime={note.createdAt} className="text-xs text-content-muted">
            {new Date(note.createdAt).toLocaleString()}
          </time>
          {note.editedAt ? <span className="text-xs text-content-muted">· edited</span> : null}
        </div>
      </div>

      {/* Notes are pasted from chat, so newlines carry meaning. */}
      <p className="mt-gap-xs whitespace-pre-wrap text-base leading-relaxed text-content">
        {note.body}
      </p>

      <Can action="update" subject="SupplierProfile">
        <div className="mt-gap flex gap-gap">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:text-danger"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </Can>
    </article>
  )
}

function NotesSkeleton() {
  return (
    <div className="space-y-gutter">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-gap-xs">
          <Skeleton variant="text" className="w-40" />
          <Skeleton variant="text" className="w-full" />
          <Skeleton variant="text" className="w-3/4" />
        </div>
      ))}
    </div>
  )
}
