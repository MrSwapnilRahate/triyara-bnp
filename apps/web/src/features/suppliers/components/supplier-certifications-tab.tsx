'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  useToast,
} from '@triyara/ui'
import {
  CERTIFICATION_STATUSES,
  CERTIFICATION_TYPES,
  type SupplierCertificationDto,
  type SupplierCertificationInput,
  supplierCertificationSchema,
} from '@triyara/validation'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import {
  useAddSupplierCertification,
  useDeleteSupplierCertification,
  useSupplierCertificationList,
  useUpdateSupplierCertification,
} from '../api/suppliers'
import type { SupplierCertificationRow } from '../types'

/**
 * Supplier certifications (TRY-BNP-SUPPLIER-CERT).
 *
 * The evidence behind "verified supplier". The desk filters on FSSAI, HACCP or
 * organic before showing anyone to a buyer, so the list leads with what lapses
 * next rather than with the certificate number.
 *
 * Editing is gated on `update SupplierProfile` - ADMIN and EXPORT_MANAGER. A
 * lesser role sees the certificates and no controls.
 */

const DAY = 86_400_000

/** Expiry is the whole point of the screen, so it is stated, not implied. */
function expiryTone(row: SupplierCertificationRow): {
  label: string
  tone: 'danger' | 'warning' | 'neutral'
} | null {
  if (!row.expiryDate) return null
  const due = new Date(row.expiryDate).getTime() - Date.now()
  if (due < 0) return { label: 'Expired', tone: 'danger' }
  if (due < 30 * DAY) return { label: `Expires in ${Math.ceil(due / DAY)} days`, tone: 'warning' }
  return { label: `Valid to ${new Date(row.expiryDate).toLocaleDateString()}`, tone: 'neutral' }
}

const asDate = (value: string | null) => (value ? value.slice(0, 10) : '')

export function SupplierCertificationsTab({ supplierId }: { supplierId: string }) {
  const ability = useAbility()
  const canWrite = ability.can('update', 'SupplierProfile')

  const certifications = useSupplierCertificationList(supplierId)
  const remove = useDeleteSupplierCertification(supplierId)
  const toast = useToast()

  const [editing, setEditing] = useState<SupplierCertificationRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<SupplierCertificationRow | null>(null)

  if (certifications.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-48" />
        <Skeleton className="mt-gap-lg h-40 w-full max-w-3xl" />
      </div>
    )

  if (certifications.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError
          error={certifications.error}
          onRetry={() => void certifications.refetch()}
        />
      </div>
    )

  const rows = certifications.data

  return (
    <div className="p-gutter">
      <div className="mx-auto max-w-3xl">
        <div className="mb-gap-lg flex items-center justify-between gap-gap-lg">
          <p className="text-xs text-content-muted">
            {rows.length === 0
              ? 'Nothing recorded yet.'
              : `${rows.length} ${rows.length === 1 ? 'certificate' : 'certificates'}`}
          </p>
          {canWrite ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus />
              Add certification
            </Button>
          ) : null}
        </div>

        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<ShieldCheck />}
                title="No certifications recorded"
                description="Buyers frequently require FSSAI, HACCP or organic certification. Record what this supplier holds so they appear in a filtered search."
              />
            ) : (
              <ul>
                {rows.map((row, index) => {
                  const expiry = expiryTone(row)
                  return (
                    <li key={row.id}>
                      {index > 0 ? <Separator /> : null}
                      <div className="flex items-start justify-between gap-gap-lg px-gutter py-gap-lg">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-content">
                            {row.type}
                            <span className="ml-gap font-mono text-xs text-content-muted">
                              {row.certificateNumber}
                            </span>
                          </p>
                          <div className="mt-gap-xs flex flex-wrap items-center gap-gap">
                            <Badge size="sm" tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                              {row.status.replace('_', ' ')}
                            </Badge>
                            {expiry ? (
                              <Badge size="sm" tone={expiry.tone}>
                                {expiry.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-content-subtle">
                                No expiry recorded
                              </span>
                            )}
                          </div>
                          {row.issuedBy ? (
                            <p className="mt-gap-xs text-xs text-content-muted">
                              Issued by {row.issuedBy}
                            </p>
                          ) : null}
                          {row.scope ? (
                            <p className="mt-gap-xs text-xs text-content-subtle">{row.scope}</p>
                          ) : null}
                        </div>

                        {canWrite ? (
                          <div className="flex shrink-0 items-center gap-gap">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Remove ${row.type} ${row.certificateNumber}`}
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {adding ? (
        <CertificationDialog supplierId={supplierId} onClose={() => setAdding(false)} />
      ) : null}
      {editing ? (
        <CertificationDialog
          supplierId={supplierId}
          certification={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove this ${deleting?.type ?? ''} certificate?`}
        description="It stops appearing on this supplier and in certification-filtered searches. Past activity that mentions it is unaffected."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return
          await remove.mutateAsync({ id: deleting.id, version: deleting.version })
          toast.success('Certification removed')
        }}
      />
    </div>
  )
}

/** Add and edit share a dialog: the fields and the rules are identical. */
function CertificationDialog({
  supplierId,
  certification,
  onClose,
}: {
  supplierId: string
  certification?: SupplierCertificationRow
  onClose: () => void
}) {
  const toast = useToast()
  const add = useAddSupplierCertification(supplierId)
  const update = useUpdateSupplierCertification(supplierId)
  const isEdit = certification !== undefined

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SupplierCertificationInput, unknown, SupplierCertificationDto>({
    resolver: zodResolver(supplierCertificationSchema),
    defaultValues: {
      type: (certification?.type as SupplierCertificationInput['type']) ?? 'FSSAI',
      certificateNumber: certification?.certificateNumber ?? '',
      issuedBy: certification?.issuedBy ?? '',
      // `<input type="date">` yields a string, which `z.coerce.date()` accepts
      // at runtime - but its TypeScript input type says `Date`, so the two
      // disagree only on paper. Cast here rather than duplicating the schema
      // with a string-shaped twin that could drift from it.
      issuedDate: asDate(certification?.issuedDate ?? null) as unknown as Date,
      expiryDate: asDate(certification?.expiryDate ?? null) as unknown as Date,
      status: (certification?.status as SupplierCertificationInput['status']) ?? 'ACTIVE',
      scope: certification?.scope ?? '',
    },
  })

  async function onSubmit(values: SupplierCertificationDto) {
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: certification.id,
          dto: values,
          version: certification.version,
        })
        toast.success('Certification updated')
      } else {
        await add.mutateAsync(values)
        toast.success('Certification added')
      }
      onClose()
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
        ...(described.requestId ? { requestId: described.requestId } : {}),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit certification' : 'Add certification'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="grid gap-gap-lg">
            <div className="grid gap-gap-lg sm:grid-cols-2">
              <div>
                <Label htmlFor="cert-type" required>
                  Type
                </Label>
                <Select
                  value={watch('type')}
                  onValueChange={(v) => setValue('type', v as SupplierCertificationInput['type'])}
                >
                  <SelectTrigger id="cert-type" className="mt-gap-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CERTIFICATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cert-number" required>
                  Certificate number
                </Label>
                <Input
                  id="cert-number"
                  className="mt-gap-xs"
                  autoFocus
                  {...register('certificateNumber')}
                  invalid={Boolean(errors.certificateNumber)}
                />
                {errors.certificateNumber ? (
                  <p className="mt-gap-xs text-xs text-danger" role="alert">
                    {errors.certificateNumber.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-gap-lg sm:grid-cols-2">
              <div>
                <Label htmlFor="cert-issued">Issued on</Label>
                <Input
                  id="cert-issued"
                  type="date"
                  className="mt-gap-xs"
                  {...register('issuedDate')}
                />
              </div>
              <div>
                <Label htmlFor="cert-expiry">Expires on</Label>
                <Input
                  id="cert-expiry"
                  type="date"
                  className="mt-gap-xs"
                  {...register('expiryDate')}
                />
                {errors.expiryDate ? (
                  <p className="mt-gap-xs text-xs text-danger" role="alert">
                    {errors.expiryDate.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-gap-lg sm:grid-cols-2">
              <div>
                <Label htmlFor="cert-issuer">Issued by</Label>
                <Input
                  id="cert-issuer"
                  className="mt-gap-xs"
                  placeholder="FSSAI"
                  {...register('issuedBy')}
                />
              </div>
              <div>
                <Label htmlFor="cert-status">Status</Label>
                <Select
                  value={watch('status') ?? 'ACTIVE'}
                  onValueChange={(v) =>
                    setValue('status', v as SupplierCertificationInput['status'])
                  }
                >
                  <SelectTrigger id="cert-status" className="mt-gap-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CERTIFICATION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="cert-scope">Scope</Label>
              <Input
                id="cert-scope"
                className="mt-gap-xs"
                placeholder="Unit II - spice grinding"
                {...register('scope')}
              />
              <p className="mt-gap-xs text-xs text-content-subtle">
                What the certificate actually covers.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Add certification'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
