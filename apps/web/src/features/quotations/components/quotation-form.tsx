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
  type CreateQuotationDto,
  createQuotationSchema,
  QUOTATION_INCOTERMS,
  QUOTATION_TYPES,
  type UpdateQuotationDto,
} from '@triyara/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { useAbility } from '@/lib/ability-context'
import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useCreateQuotation, useUpdateQuotation } from '../api/quotations'
import { isEditable, type Quotation } from '../types'
import { emptyLine, quotationLinesSchema } from './line-schema'
import { QuotationLinesField } from './quotation-lines-field'
import { useDirtyGuard } from './use-dirty-guard'

/** Blank optional input means "not provided", not the empty string. */
const optionalText = { setValueAs: (value: unknown) => (value === '' ? undefined : value) }

const createWithLinesSchema = createQuotationSchema.extend({
  items: quotationLinesSchema.shape.items,
})

type QuotationFormInput = z.input<typeof createWithLinesSchema>
type QuotationFormOutput = z.output<typeof createWithLinesSchema>

/**
 * Quotation create and edit (§9, §18).
 *
 * Create takes the header AND its first lines in one submit, mirroring
 * POST /api/quotations: a quotation with no lines cannot be approved, and a
 * two-step create would leave unusable records behind whenever the second step
 * never arrived.
 *
 * Edit is header-only, and only while the quotation is still editable. Once
 * SENT the document is a commitment and the route to change it is a revision.
 */
export function QuotationForm({ quotation, version }: { quotation?: Quotation; version?: number }) {
  const router = useRouter()
  const toast = useToast()
  const ability = useAbility()
  const isEdit = Boolean(quotation)
  const showCost = ability.can('manage', 'Account')

  const create = useCreateQuotation()
  const update = useUpdateQuotation(quotation?.id ?? '')

  const frozen = quotation ? !isEditable(quotation.status) : false

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<QuotationFormInput, unknown, QuotationFormOutput>({
    // Edit validates the header ONLY. Not `items.optional()` - the edit form
    // holds `items: []`, and an empty array still fails `.min(1)`.
    resolver: zodResolver(
      (isEdit
        ? createQuotationSchema
        : createWithLinesSchema) as unknown as typeof createWithLinesSchema,
    ),
    defaultValues: {
      quotationNumber: quotation?.quotationNumber ?? '',
      type: (quotation?.type ?? 'FIRM') as QuotationFormInput['type'],
      buyerId: quotation?.buyerId ?? '',
      title: quotation?.title ?? '',
      description: quotation?.description ?? undefined,
      currency: quotation?.currency ?? 'USD',
      baseCurrency: quotation?.baseCurrency ?? 'USD',
      incoterm: (quotation?.incoterm ?? undefined) as QuotationFormInput['incoterm'],
      namedPlace: quotation?.namedPlace ?? undefined,
      destinationCountry: quotation?.destinationCountry ?? undefined,
      destinationPort: quotation?.destinationPort ?? undefined,
      paymentTermsText: quotation?.paymentTermsText ?? undefined,
      packingSummary: quotation?.packingSummary ?? undefined,
      samplingTerms: quotation?.samplingTerms ?? undefined,
      items: isEdit ? [] : [emptyLine],
    },
  })

  useDirtyGuard(isDirty && !isSubmitting)

  const currency = watch('currency') ?? 'USD'

  async function onSubmit(values: QuotationFormOutput) {
    try {
      if (isEdit && quotation) {
        const { items: _items, ...header } = values
        const result = await update.mutateAsync({
          dto: header as UpdateQuotationDto,
          version: version ?? quotation.version,
        })
        toast.success('Quotation saved')
        router.push(`/quotations/${result.quotation.id}`)
      } else {
        const created = await create.mutateAsync(values as CreateQuotationDto & QuotationFormOutput)
        toast.success('Quotation created', 'It starts in draft. Approval is the next step.')
        router.push(`/quotations/${created.id}`)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof QuotationFormInput, {
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
        title={isEdit ? 'Edit quotation' : 'New quotation'}
        {...(quotation ? { identifier: quotation.quotationNumber } : {})}
        description={
          isEdit
            ? 'Header only. Lines, charges and taxes are edited on their own screens because each re-prices the quotation.'
            : 'A quotation starts in draft with its lines. Approval and sending are separate steps.'
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={quotation ? `/quotations/${quotation.id}` : '/quotations'}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              form="quotation-form"
              variant="primary"
              loading={isSubmitting}
              disabled={(isEdit && !isDirty) || frozen}
            >
              {isEdit ? 'Save changes' : 'Create quotation'}
            </Button>
          </>
        }
      />

      <form id="quotation-form" onSubmit={handleSubmit(onSubmit)} className="p-gutter">
        <div className="mx-auto grid max-w-4xl gap-gutter">
          {Object.keys(errors).length > 0 ? (
            <Alert tone="danger" title="Check the highlighted fields" />
          ) : null}

          {frozen ? (
            <Alert tone="danger" title="This quotation can no longer be edited">
              It is {quotation!.status.toLowerCase().replace(/_/g, ' ')}. Changing it means creating
              a revision.
            </Alert>
          ) : null}

          {isDirty && !isSubmitting ? (
            <p className="text-xs text-content-subtle" role="status">
              Unsaved changes. Leaving this page will discard them.
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle as="h2">Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-2">
              <Field
                label="Quotation number"
                required
                error={errors.quotationNumber?.message}
                htmlFor="quotationNumber"
                hint="Uppercase letters, digits and hyphens"
              >
                <Input
                  id="quotationNumber"
                  {...register('quotationNumber')}
                  invalid={Boolean(errors.quotationNumber)}
                  disabled={isEdit}
                  placeholder="QT-2026-000001"
                  autoComplete="off"
                  className="uppercase"
                />
              </Field>

              <Field label="Type" required error={errors.type?.message} htmlFor="type">
                <Select
                  value={watch('type')}
                  onValueChange={(value) =>
                    setValue('type', value as QuotationFormInput['type'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="type" invalid={Boolean(errors.type)}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Buyer account"
                required
                error={errors.buyerId?.message}
                htmlFor="buyerId"
                hint="Account id this quotation is for"
              >
                <Input
                  id="buyerId"
                  {...register('buyerId')}
                  invalid={Boolean(errors.buyerId)}
                  autoComplete="off"
                />
              </Field>

              <Field label="Title" error={errors.title?.message} htmlFor="title">
                <Input
                  id="title"
                  {...register('title', optionalText)}
                  invalid={Boolean(errors.title)}
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
                required
                error={errors.currency?.message}
                htmlFor="currency"
                hint="ISO 4217"
              >
                <Input
                  id="currency"
                  {...register('currency')}
                  invalid={Boolean(errors.currency)}
                  maxLength={3}
                  className="uppercase"
                />
              </Field>

              <Field
                label="Base currency"
                required
                error={errors.baseCurrency?.message}
                htmlFor="baseCurrency"
                hint="For FX conversion"
              >
                <Input
                  id="baseCurrency"
                  {...register('baseCurrency')}
                  invalid={Boolean(errors.baseCurrency)}
                  maxLength={3}
                  className="uppercase"
                />
              </Field>

              <Field label="Incoterm" error={errors.incoterm?.message} htmlFor="incoterm">
                <Select
                  value={watch('incoterm') ?? ''}
                  onValueChange={(value) =>
                    setValue('incoterm', value as QuotationFormInput['incoterm'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="incoterm" invalid={Boolean(errors.incoterm)}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTATION_INCOTERMS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Named place" error={errors.namedPlace?.message} htmlFor="namedPlace">
                <Input
                  id="namedPlace"
                  {...register('namedPlace', optionalText)}
                  invalid={Boolean(errors.namedPlace)}
                />
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
                />
              </Field>

              <Field label="Valid from" error={errors.validFrom?.message} htmlFor="validFrom">
                <Input
                  id="validFrom"
                  type="date"
                  {...register('validFrom', optionalText)}
                  invalid={Boolean(errors.validFrom)}
                />
              </Field>

              <Field label="Valid until" error={errors.validUntil?.message} htmlFor="validUntil">
                <Input
                  id="validUntil"
                  type="date"
                  {...register('validUntil', optionalText)}
                  invalid={Boolean(errors.validUntil)}
                />
              </Field>

              <Field
                label="Payment terms"
                error={errors.paymentTermsText?.message}
                htmlFor="paymentTermsText"
              >
                <Input
                  id="paymentTermsText"
                  {...register('paymentTermsText', optionalText)}
                  invalid={Boolean(errors.paymentTermsText)}
                  placeholder="30% advance, balance against BL"
                />
              </Field>
            </CardContent>
          </Card>

          {!isEdit ? (
            <QuotationLinesField
              control={control}
              register={register}
              errors={errors}
              showCost={showCost}
              currency={currency}
            />
          ) : null}
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
