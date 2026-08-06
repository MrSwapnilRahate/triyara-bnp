'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@triyara/ui'
import {
  type CreateRfqDto,
  createRfqSchema,
  RFQ_INCOTERMS,
  RFQ_PRIORITIES,
  RFQ_TYPES,
  type UpdateRfqDto,
} from '@triyara/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useCreateRfq, useUpdateRfq } from '../api/rfqs'
import { type Rfq, TERMS_FROZEN_IN } from '../types'
import { humanise } from './humanise'
import { emptyLine, rfqLinesSchema } from './line-schema'
import { RfqItemsField } from './rfq-items-field'

/** Blank optional input means "not provided", not the empty string. */
const optionalText = { setValueAs: (value: unknown) => (value === '' ? undefined : value) }

const createWithItemsSchema = createRfqSchema.extend({ items: rfqLinesSchema.shape.items })

type RfqFormInput = z.input<typeof createWithItemsSchema>
type RfqFormOutput = z.output<typeof createWithItemsSchema>

/**
 * RFQ create and edit (§9, §18).
 *
 * Create takes the header AND its first lines in one submit, mirroring the API:
 * POST /api/rfqs accepts both, because an RFQ with no lines cannot be approved
 * and a two-step create would leave unusable records behind whenever the second
 * step never arrived.
 *
 * Edit is header-only. Lines are revised on their own screen, since replacing
 * them cuts a revision - a different operation with different consequences.
 */
export function RfqForm({ rfq, version }: { rfq?: Rfq; version?: number }) {
  const router = useRouter()
  const toast = useToast()
  const isEdit = Boolean(rfq)

  const create = useCreateRfq()
  const update = useUpdateRfq(rfq?.id ?? '')

  // Once issued, the API refuses a change to these four. Disabling them is
  // honest about that rather than letting the user type and then serving a 409.
  const termsFrozen = rfq ? TERMS_FROZEN_IN.includes(rfq.status) : false

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RfqFormInput, unknown, RfqFormOutput>({
    // Edit validates the header ONLY. Not `items.optional()` - the edit form
    // holds `items: []`, and an empty array still fails `.min(1)`. The header
    // schema has no `items` key at all, so zod strips it and never checks it.
    resolver: zodResolver(
      (isEdit ? createRfqSchema : createWithItemsSchema) as unknown as typeof createWithItemsSchema,
    ),
    defaultValues: {
      rfqNumber: rfq?.rfqNumber ?? '',
      type: (rfq?.type ?? 'BUYER') as RfqFormInput['type'],
      buyerId: rfq?.buyerId ?? undefined,
      title: rfq?.title ?? '',
      description: rfq?.description ?? undefined,
      currency: rfq?.currency ?? undefined,
      incoterm: (rfq?.incoterm ?? undefined) as RfqFormInput['incoterm'],
      destinationCountry: rfq?.destinationCountry ?? undefined,
      destinationPort: rfq?.destinationPort ?? undefined,
      priority: (rfq?.priority ?? 'NORMAL') as RfqFormInput['priority'],
      items: isEdit ? [] : [emptyLine],
    },
  })

  const type = watch('type')

  async function onSubmit(values: RfqFormOutput) {
    try {
      if (isEdit && rfq) {
        const { items: _items, ...header } = values
        const result = await update.mutateAsync({
          dto: header as UpdateRfqDto,
          version: version ?? rfq.version,
        })
        toast.success('RFQ saved')
        router.push(`/rfqs/${result.rfq.id}`)
      } else {
        const created = await create.mutateAsync(values as CreateRfqDto & RfqFormOutput)
        toast.success('RFQ created', 'It starts in draft. Approval is the next step.')
        router.push(`/rfqs/${created.id}`)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof RfqFormInput, {
            type: 'server',
            message: fieldError.message,
          })
        }
        if (error.fieldErrors.length > 0) return
      }
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
        ...(described.requestId ? { requestId: described.requestId } : {}),
      })
    }
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit RFQ' : 'New RFQ'}
        {...(rfq ? { identifier: rfq.rfqNumber } : {})}
        description={
          isEdit
            ? 'Header only. Lines are revised on their own screen, because replacing them cuts a revision.'
            : 'An RFQ starts in draft with its lines. Approval and publishing are separate steps.'
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={rfq ? `/rfqs/${rfq.id}` : '/rfqs'}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              form="rfq-form"
              variant="primary"
              loading={isSubmitting}
              disabled={isEdit && !isDirty}
            >
              {isEdit ? 'Save changes' : 'Create RFQ'}
            </Button>
          </>
        }
      />

      <form id="rfq-form" onSubmit={handleSubmit(onSubmit)} className="p-gutter">
        <div className="mx-auto grid max-w-3xl gap-gutter">
          {Object.keys(errors).length > 0 ? (
            <Alert tone="danger" title="Check the highlighted fields" />
          ) : null}

          {termsFrozen ? (
            <Alert tone="info" title="Commercial terms are frozen">
              This RFQ is out with suppliers, so currency, incoterm and destination can no longer
              change.
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle as="h2">Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-2">
              <Field
                label="RFQ number"
                required
                error={errors.rfqNumber?.message}
                htmlFor="rfqNumber"
                hint="Uppercase letters, digits and hyphens"
              >
                <Input
                  id="rfqNumber"
                  {...register('rfqNumber')}
                  invalid={Boolean(errors.rfqNumber)}
                  disabled={isEdit}
                  placeholder="RFQ-2026-000001"
                  autoComplete="off"
                  className="uppercase"
                />
              </Field>

              <Field label="Type" required error={errors.type?.message} htmlFor="type">
                <Select
                  value={type}
                  onValueChange={(value) =>
                    setValue('type', value as RfqFormInput['type'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={isEdit}
                >
                  <SelectTrigger id="type" invalid={Boolean(errors.type)}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {RFQ_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {humanise(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Title"
                required
                error={errors.title?.message}
                htmlFor="title"
                className="sm:col-span-2"
              >
                <Input id="title" {...register('title')} invalid={Boolean(errors.title)} />
              </Field>

              {/* A BUYER RFQ must name its buyer; an INTERNAL one must not. */}
              {type === 'BUYER' ? (
                <Field
                  label="Buyer account"
                  required
                  error={errors.buyerId?.message}
                  htmlFor="buyerId"
                  hint="Account id of the buyer this RFQ is raised for"
                  className="sm:col-span-2"
                >
                  <Input
                    id="buyerId"
                    {...register('buyerId', optionalText)}
                    invalid={Boolean(errors.buyerId)}
                    autoComplete="off"
                  />
                </Field>
              ) : null}

              <Field
                label="Description"
                error={errors.description?.message}
                htmlFor="description"
                className="sm:col-span-2"
              >
                <Input
                  id="description"
                  {...register('description', optionalText)}
                  invalid={Boolean(errors.description)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Commercial terms</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-3">
              <Field
                label="Currency"
                error={errors.currency?.message}
                htmlFor="currency"
                hint="ISO 4217"
              >
                <Input
                  id="currency"
                  {...register('currency', optionalText)}
                  invalid={Boolean(errors.currency)}
                  disabled={termsFrozen}
                  maxLength={3}
                  className="uppercase"
                  placeholder="USD"
                />
              </Field>

              <Field label="Incoterm" error={errors.incoterm?.message} htmlFor="incoterm">
                <Select
                  value={watch('incoterm') ?? ''}
                  onValueChange={(value) =>
                    setValue('incoterm', value as RfqFormInput['incoterm'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={termsFrozen}
                >
                  <SelectTrigger id="incoterm" invalid={Boolean(errors.incoterm)}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {RFQ_INCOTERMS.map((incoterm) => (
                      <SelectItem key={incoterm} value={incoterm}>
                        {incoterm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Priority" error={errors.priority?.message} htmlFor="priority">
                <Select
                  value={watch('priority')}
                  onValueChange={(value) =>
                    setValue('priority', value as RfqFormInput['priority'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="priority" invalid={Boolean(errors.priority)}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {RFQ_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {humanise(priority)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Destination country"
                error={errors.destinationCountry?.message}
                htmlFor="destinationCountry"
                hint="ISO alpha-2"
              >
                <Input
                  id="destinationCountry"
                  {...register('destinationCountry', optionalText)}
                  invalid={Boolean(errors.destinationCountry)}
                  disabled={termsFrozen}
                  maxLength={2}
                  className="uppercase"
                />
              </Field>

              <Field
                label="Destination port"
                error={errors.destinationPort?.message}
                htmlFor="destinationPort"
              >
                <Input
                  id="destinationPort"
                  {...register('destinationPort', optionalText)}
                  invalid={Boolean(errors.destinationPort)}
                  disabled={termsFrozen}
                />
              </Field>

              <Field
                label="Quotation deadline"
                error={errors.quotationDeadline?.message}
                htmlFor="quotationDeadline"
              >
                <Input
                  id="quotationDeadline"
                  type="date"
                  {...register('quotationDeadline', optionalText)}
                  invalid={Boolean(errors.quotationDeadline)}
                  disabled={termsFrozen}
                />
              </Field>
            </CardContent>
          </Card>

          {!isEdit ? <RfqItemsField control={control} register={register} errors={errors} /> : null}
        </div>
      </form>
    </>
  )
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      <div className="mt-gap-xs">{children}</div>
      {error ? (
        <p className="mt-gap-xs text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-gap-xs text-xs text-content-subtle">{hint}</p>
      ) : null}
    </div>
  )
}
