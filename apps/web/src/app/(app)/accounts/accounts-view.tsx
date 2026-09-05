'use client'

import type { AccountRecord } from '@triyara/db'
import {
  Button,
  Checkbox,
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
  SkeletonTable,
  StatusBadge,
} from '@triyara/ui'
import { RELATIONSHIP_STATUSES, type RelationshipStatus } from '@triyara/validation'
import { AlertTriangle, Users } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useId, useMemo, useState } from 'react'

import {
  useAccounts,
  useBulkAccountStatus,
  useCreateAccount,
  useDeleteAccount,
  useRestoreAccount,
  useUpdateAccount,
} from '@/features/accounts/api/accounts'
import { useAbility } from '@/lib/ability-context'

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

  // The layout renders `state` INSTEAD of the table, so it must be undefined
  // once there are rows - otherwise the table never appears.
  let state: React.ReactNode
  if (error)
    state = (
      <EmptyState
        variant="error"
        icon={<AlertTriangle />}
        title="Could not load accounts"
        description={message(error)}
      />
    )
  else if (isPending) state = <SkeletonTable rows={8} columns={7} />
  else if (accounts.length === 0)
    state = (
      <EmptyState
        icon={<Users />}
        title="No accounts match these filters"
        description="Adjust the filters above, or create the first account."
        {...(canWrite
          ? {
              action: (
                <Button variant="primary" onClick={() => setDialog({ type: 'create' })}>
                  Create the first account
                </Button>
              ),
            }
          : {})}
      />
    )

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every counterparty this organization deals with, and where each one stands."
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setDialog({ type: 'create' })}>
              New account
            </Button>
          ) : null
        }
      />

      <div className="p-gutter">
        {/* Deliberately unconstrained in height, like the documents and
            verifications tables. Capping it makes the layout's flex column
            squeeze the toolbar - which wraps to four rows on a phone - down to
            its `min-h-12`, and the filters then overlap the first rows. */}
        <DataTableLayout
          toolbar={<Filters params={params} onApply={setParam} />}
          {...(selected.size > 0
            ? {
                selectionBar: (
                  <BulkToolbar ids={[...selected]} onDone={() => setSelected(new Set())} />
                ),
              }
            : {})}
          {...(state ? { state } : {})}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setParam({ cursor: undefined })}>
                First page
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!nextCursor}
                onClick={() => nextCursor && setParam({ cursor: nextCursor })}
              >
                Next
              </Button>
            </>
          }
        >
          <DataTable caption="Accounts">
            <DataTableHead>
              <tr>
                <DataTableHeaderCell className="w-8">
                  <span className="sr-only">Select</span>
                </DataTableHeaderCell>
                <DataTableHeaderCell>Legal name</DataTableHeaderCell>
                <DataTableHeaderCell>Country</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
                <DataTableHeaderCell>Owner</DataTableHeaderCell>
                <DataTableHeaderCell>Created</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">
                  <span className="sr-only">Actions</span>
                </DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {accounts.map((a) => (
                <DataTableRow key={a.id} className={a.deletedAt ? 'opacity-60' : undefined}>
                  <DataTableCell>
                    <Checkbox
                      checked={selected.has(a.id)}
                      onCheckedChange={() => toggle(a.id)}
                      disabled={!!a.deletedAt}
                      aria-label={`Select ${a.legalName}`}
                    />
                  </DataTableCell>
                  <DataTableCell>
                    <div className="font-medium text-content">{a.legalName}</div>
                    {a.displayName ? (
                      <div className="text-xs text-content-subtle">{a.displayName}</div>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">{a.country ?? '—'}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={a.relationshipStatus} />
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {a.owner?.name ?? '—'}
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </DataTableCell>
                  <DataTableCell className="text-right">
                    {canWrite ? (
                      a.deletedAt ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialog({ type: 'restore', account: a })}
                        >
                          Restore
                        </Button>
                      ) : (
                        <div className="flex justify-end gap-gap-xs">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDialog({ type: 'edit', account: a })}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDialog({ type: 'delete', account: a })}
                          >
                            Delete
                          </Button>
                        </div>
                      )
                    ) : null}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </DataTableLayout>
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
    </>
  )
}

/**
 * The filter row, still one submitted form.
 *
 * Deliberately not debounced or per-control: every field is read from FormData
 * on Apply and pushed into the URL together, which is what keeps a filtered
 * view linkable and the back button honest. Native controls throughout, because
 * FormData is the contract.
 */
function Filters({
  params,
  onApply,
}: {
  params: URLSearchParams
  onApply: (next: Record<string, string | undefined>) => void
}) {
  const ids = useId()
  return (
    <form
      className="flex flex-wrap items-end gap-gap"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        onApply({
          q: String(fd.get('q') ?? ''),
          country: String(fd.get('country') ?? ''),
          relationshipStatus: String(fd.get('relationshipStatus') ?? ''),
          ownerId: String(fd.get('ownerId') ?? ''),
          includeDeleted: fd.get('includeDeleted') ? 'true' : '',
          cursor: undefined,
        })
      }}
    >
      <Input
        name="q"
        size="sm"
        aria-label="Search name"
        defaultValue={params.get('q') ?? ''}
        placeholder="Search name"
        className="w-48"
      />
      <Input
        name="country"
        size="sm"
        aria-label="Country (ISO2)"
        defaultValue={params.get('country') ?? ''}
        placeholder="Country (ISO2)"
        className="w-32"
      />
      {/* Width belongs on the wrapper, not the control: the chevron is
          positioned against the wrapper, so sizing the `select` alone leaves it
          stranded at the far edge of the toolbar. */}
      <div className="w-40">
        <NativeSelect
          name="relationshipStatus"
          size="sm"
          aria-label="Relationship status"
          defaultValue={params.get('relationshipStatus') ?? ''}
        >
          <option value="">Any status</option>
          {RELATIONSHIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Input
        name="ownerId"
        size="sm"
        aria-label="Owner id"
        defaultValue={params.get('ownerId') ?? ''}
        placeholder="Owner id"
        className="w-40"
      />
      <label
        htmlFor={`${ids}-deleted`}
        className="flex items-center gap-gap text-xs text-content-muted"
      >
        <Checkbox
          id={`${ids}-deleted`}
          name="includeDeleted"
          defaultChecked={params.get('includeDeleted') === 'true'}
        />
        Include deleted
      </label>
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
    </form>
  )
}

/** Shared dialog frame, so the four dialogs cannot drift apart. */
function AccountDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount()
  const ids = useId()
  return (
    <AccountDialog title="New account" onClose={onClose}>
      <form
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
        <DialogBody className="grid gap-gap-lg">
          <div>
            <Label htmlFor={`${ids}-legal`} required>
              Legal name
            </Label>
            <Input
              id={`${ids}-legal`}
              name="legalName"
              required
              placeholder="Legal name"
              className="mt-gap-xs"
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-display`}>Display name</Label>
            <Input
              id={`${ids}-display`}
              name="displayName"
              placeholder="Display name (optional)"
              className="mt-gap-xs"
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-country`}>Country</Label>
            <Input
              id={`${ids}-country`}
              name="country"
              placeholder="Country (ISO2, optional)"
              className="mt-gap-xs"
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-status`}>Relationship status</Label>
            <NativeSelect
              id={`${ids}-status`}
              name="relationshipStatus"
              defaultValue="PROSPECT"
              className="mt-gap-xs"
            >
              {RELATIONSHIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor={`${ids}-source`}>Source</Label>
            <Input
              id={`${ids}-source`}
              name="source"
              placeholder="Source (optional)"
              className="mt-gap-xs"
            />
          </div>
          {create.error ? (
            <p className="text-sm text-danger" role="alert">
              {message(create.error)}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogButtons pending={create.isPending} onClose={onClose} submitLabel="Create" />
        </DialogFooter>
      </form>
    </AccountDialog>
  )
}

function EditDialog({ account, onClose }: { account: AccountRecord; onClose: () => void }) {
  const update = useUpdateAccount()
  const ids = useId()
  return (
    <AccountDialog title="Edit account" onClose={onClose}>
      <form
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
        <DialogBody className="grid gap-gap-lg">
          <div>
            <Label htmlFor={`${ids}-legal`}>Legal name</Label>
            <Input
              id={`${ids}-legal`}
              name="legalName"
              defaultValue={account.legalName}
              className="mt-gap-xs"
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-display`}>Display name</Label>
            <Input
              id={`${ids}-display`}
              name="displayName"
              defaultValue={account.displayName ?? ''}
              placeholder="Display name"
              className="mt-gap-xs"
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-country`}>Country</Label>
            <Input
              id={`${ids}-country`}
              name="country"
              defaultValue={account.country ?? ''}
              placeholder="Country (ISO2)"
              className="mt-gap-xs"
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-source`}>Source</Label>
            <Input
              id={`${ids}-source`}
              name="source"
              defaultValue={account.source ?? ''}
              placeholder="Source"
              className="mt-gap-xs"
            />
          </div>
          {update.error ? (
            <p className="text-sm text-danger" role="alert">
              {message(update.error)}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogButtons pending={update.isPending} onClose={onClose} submitLabel="Save" />
        </DialogFooter>
      </form>
    </AccountDialog>
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
    <AccountDialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm()
        }}
      >
        <DialogBody className="grid gap-gap">
          <p className="text-base text-content-muted">{body}</p>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {message(error)}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogButtons pending={pending} onClose={onClose} submitLabel="Confirm" />
        </DialogFooter>
      </form>
    </AccountDialog>
  )
}

function BulkToolbar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const bulk = useBulkAccountStatus()
  const fieldId = useId()
  return (
    <form
      className="flex flex-wrap items-center gap-gap"
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
      <span className="text-base font-medium text-content">{ids.length} selected</span>
      <Label htmlFor={fieldId} className="sr-only">
        Relationship status
      </Label>
      <div className="w-40">
        <NativeSelect id={fieldId} name="relationshipStatus" size="sm" defaultValue="ACTIVE">
          {RELATIONSHIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={bulk.isPending}>
        Apply status
      </Button>
      {bulk.error ? (
        <span className="text-sm text-danger" role="alert">
          {message(bulk.error)}
        </span>
      ) : null}
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
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
      {/* The pending label is kept verbatim rather than replaced by the spinner
          alone: it is user-facing text this migration is not entitled to
          change, and the accessible name changing on submit is existing
          behaviour. */}
      <Button type="submit" variant="primary" disabled={pending} loading={pending}>
        {pending ? 'Working...' : submitLabel}
      </Button>
    </>
  )
}
