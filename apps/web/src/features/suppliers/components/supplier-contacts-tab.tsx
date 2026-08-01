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
  Switch,
  useToast,
} from '@triyara/ui'
import {
  SUPPLIER_CONTACT_ROLES,
  type SupplierContactDto,
  type SupplierContactInput,
  supplierContactSchema,
} from '@triyara/validation'
import { Mail, MessageCircle, Phone, Plus, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import {
  useAddSupplierContact,
  useDeleteSupplierContact,
  useSupplierContacts,
  useUpdateSupplierContact,
} from '../api/suppliers'
import type { SupplierContact } from '../types'

/**
 * Supplier contacts (TRY-BNP-SUPPLIER-CONTACT).
 *
 * The reason this screen exists: when a supplier messages on WhatsApp, the
 * person's name and number belong here rather than in the chat history. So the
 * form leads with the three ways to reach someone and treats the rest as
 * optional detail.
 *
 * Editing is gated on `update SupplierProfile` - ADMIN and EXPORT_MANAGER. A
 * lesser role sees the contacts and no controls, rather than buttons that
 * refuse.
 */

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  SALES: 'Sales',
  EXPORT_MANAGER: 'Export manager',
  ACCOUNTS: 'Accounts',
  QUALITY: 'Quality',
  LOGISTICS: 'Logistics',
  PRODUCTION: 'Production',
  OTHER: 'Other',
}

export function SupplierContactsTab({ supplierId }: { supplierId: string }) {
  const ability = useAbility()
  const canWrite = ability.can('update', 'SupplierProfile')

  const contacts = useSupplierContacts(supplierId)
  const remove = useDeleteSupplierContact(supplierId)
  const update = useUpdateSupplierContact(supplierId)
  const toast = useToast()

  const [editing, setEditing] = useState<SupplierContact | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<SupplierContact | null>(null)

  if (contacts.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-48" />
        <Skeleton className="mt-gap-lg h-40 w-full max-w-3xl" />
      </div>
    )

  if (contacts.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={contacts.error} onRetry={() => void contacts.refetch()} />
      </div>
    )

  const rows = contacts.data

  async function makePrimary(contact: SupplierContact) {
    try {
      await update.mutateAsync({
        id: contact.id,
        dto: { isPrimary: true },
        version: contact.version,
      })
      toast.success(`${contact.name} is now the primary contact`)
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  return (
    <div className="p-gutter">
      <div className="mx-auto max-w-3xl">
        <div className="mb-gap-lg flex items-center justify-between gap-gap-lg">
          <p className="text-xs text-content-muted">
            {rows.length === 0
              ? 'Nobody recorded yet.'
              : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
          </p>
          {canWrite ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus />
              Add contact
            </Button>
          ) : null}
        </div>

        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<UserRound />}
                title="No contacts yet"
                description="Add the person you actually talk to, so nobody has to search the chat history for a number."
              />
            ) : (
              <ul>
                {rows.map((contact, index) => (
                  <li key={contact.id}>
                    {index > 0 ? <Separator /> : null}
                    <div className="flex items-start justify-between gap-gap-lg px-gutter py-gap-lg">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-content">
                          {contact.name}
                          {contact.isPrimary ? (
                            <Badge size="sm" tone="accent" className="ml-gap">
                              Primary
                            </Badge>
                          ) : null}
                        </p>
                        <p className="mt-gap-xs text-xs text-content-muted">
                          {contact.designation ?? ROLE_LABELS[contact.role] ?? contact.role}
                        </p>
                        <div className="mt-gap flex flex-wrap gap-gap-lg text-xs text-content-muted">
                          {contact.email ? (
                            <span className="flex items-center gap-gap-xs">
                              <Mail aria-hidden className="size-3" />
                              <a className="focus-ring underline" href={`mailto:${contact.email}`}>
                                {contact.email}
                              </a>
                            </span>
                          ) : null}
                          {contact.phone ? (
                            <span className="flex items-center gap-gap-xs">
                              <Phone aria-hidden className="size-3" />
                              <a className="focus-ring underline" href={`tel:${contact.phone}`}>
                                {contact.phone}
                              </a>
                            </span>
                          ) : null}
                          {contact.whatsapp ? (
                            <span className="flex items-center gap-gap-xs">
                              <MessageCircle aria-hidden className="size-3" />
                              {contact.whatsapp}
                            </span>
                          ) : null}
                        </div>
                        {contact.notes ? (
                          <p className="mt-gap text-xs text-content-subtle">{contact.notes}</p>
                        ) : null}
                      </div>

                      {canWrite ? (
                        <div className="flex shrink-0 items-center gap-gap">
                          {contact.isPrimary ? null : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void makePrimary(contact)}
                              disabled={update.isPending}
                            >
                              Make primary
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEditing(contact)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${contact.name}`}
                            onClick={() => setDeleting(contact)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {adding ? <ContactDialog supplierId={supplierId} onClose={() => setAdding(false)} /> : null}
      {editing ? (
        <ContactDialog supplierId={supplierId} contact={editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove ${deleting?.name ?? 'this contact'}?`}
        description="The person stops appearing on this supplier. Past activity that mentions them is unaffected."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return
          await remove.mutateAsync({ id: deleting.id, version: deleting.version })
          toast.success('Contact removed')
        }}
      />
    </div>
  )
}

/** Add and edit share a dialog: the fields and the rules are identical. */
function ContactDialog({
  supplierId,
  contact,
  onClose,
}: {
  supplierId: string
  contact?: SupplierContact
  onClose: () => void
}) {
  const toast = useToast()
  const add = useAddSupplierContact(supplierId)
  const update = useUpdateSupplierContact(supplierId)
  const isEdit = contact !== undefined

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SupplierContactInput, unknown, SupplierContactDto>({
    resolver: zodResolver(supplierContactSchema),
    defaultValues: {
      name: contact?.name ?? '',
      role: (contact?.role as SupplierContactInput['role']) ?? 'OTHER',
      designation: contact?.designation ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      whatsapp: contact?.whatsapp ?? '',
      isPrimary: contact?.isPrimary ?? false,
      notes: contact?.notes ?? '',
    },
  })

  async function onSubmit(values: SupplierContactDto) {
    try {
      if (isEdit) {
        await update.mutateAsync({ id: contact.id, dto: values, version: contact.version })
        toast.success('Contact updated')
      } else {
        await add.mutateAsync(values)
        toast.success('Contact added')
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
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="grid gap-gap-lg">
            <div>
              <Label htmlFor="contact-name" required>
                Name
              </Label>
              <Input
                id="contact-name"
                className="mt-gap-xs"
                autoFocus
                {...register('name')}
                invalid={Boolean(errors.name)}
              />
              {errors.name ? (
                <p className="mt-gap-xs text-xs text-danger" role="alert">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-gap-lg sm:grid-cols-2">
              <div>
                <Label htmlFor="contact-role">Role</Label>
                <Select
                  value={watch('role')}
                  onValueChange={(v) => setValue('role', v as SupplierContactInput['role'])}
                >
                  <SelectTrigger id="contact-role" className="mt-gap-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_CONTACT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="contact-designation">Job title</Label>
                <Input
                  id="contact-designation"
                  className="mt-gap-xs"
                  placeholder="Sr. Manager - Exports"
                  {...register('designation')}
                />
              </div>
            </div>

            {/* The three ways to reach someone, together: the server requires
                at least one, and separating them would hide that. */}
            <div className="grid gap-gap-lg sm:grid-cols-3">
              <div>
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  className="mt-gap-xs"
                  {...register('email')}
                  invalid={Boolean(errors.email)}
                />
              </div>
              <div>
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" className="mt-gap-xs" {...register('phone')} />
              </div>
              <div>
                <Label htmlFor="contact-whatsapp">WhatsApp</Label>
                <Input id="contact-whatsapp" className="mt-gap-xs" {...register('whatsapp')} />
              </div>
            </div>
            {errors.email ? (
              <p className="-mt-gap text-xs text-danger" role="alert">
                {errors.email.message}
              </p>
            ) : (
              <p className="-mt-gap text-xs text-content-subtle">
                Give at least one of email, phone or WhatsApp.
              </p>
            )}

            <div>
              <Label htmlFor="contact-notes">Notes</Label>
              <Input
                id="contact-notes"
                className="mt-gap-xs"
                placeholder="Best reached after 6pm IST"
                {...register('notes')}
              />
            </div>

            <label className="flex items-center gap-gap-lg">
              <Switch
                checked={watch('isPrimary')}
                onCheckedChange={(on) => setValue('isPrimary', on)}
                aria-label="Primary contact"
              />
              <span className="text-sm text-content">
                Primary contact
                <span className="block text-xs text-content-muted">
                  Replaces whoever is primary now.
                </span>
              </span>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
