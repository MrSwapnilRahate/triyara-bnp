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
  type CreateSupplierDto,
  createSupplierSchema,
  SUPPLIER_BUSINESS_TYPES,
} from '@triyara/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useCreateSupplier, useUpdateSupplier } from '../api/suppliers'
import type { Supplier } from '../types'

/**
 * An empty text input means "not provided", not "the empty string".
 *
 * Without this, leaving an optional field blank submits '' - which fails
 * `.length(2)` on countryOfOrigin and the digits regex on hsCode, and the user
 * sees a validation error on a field they deliberately left alone.
 */
const optionalText = { setValueAs: (value: unknown) => (value === '' ? undefined : value) }

type SupplierFormInput = z.input<typeof createSupplierSchema>

export interface SupplierFormProps {
  supplier?: Supplier
  version?: number
}

/**
 * Supplier create and edit (§9, §18).
 *
 * Validates against the same `createSupplierSchema` the API enforces, so client
 * and server rules cannot drift. GST, IEC and PAN are unique per tenant; a
 * collision comes back as 409 and is surfaced on the offending field.
 */
export function SupplierForm({ supplier, version }: SupplierFormProps) {
  const router = useRouter()
  const toast = useToast()
  const isEdit = Boolean(supplier)

  const create = useCreateSupplier()
  const update = useUpdateSupplier(supplier?.id ?? '')

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SupplierFormInput, unknown, CreateSupplierDto>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      supplierCode: supplier?.supplierCode ?? '',
      companyName: supplier?.companyName ?? '',
      legalName: supplier?.legalName ?? '',
      businessType: supplier?.businessType as SupplierFormInput['businessType'],
      email: supplier?.email ?? undefined,
      phone: supplier?.phone ?? undefined,
      website: supplier?.website ?? undefined,
      gstNumber: supplier?.gstNumber ?? undefined,
      iecNumber: supplier?.iecNumber ?? undefined,
      panNumber: supplier?.panNumber ?? undefined,
      country: supplier?.country ?? undefined,
      state: supplier?.state ?? undefined,
      city: supplier?.city ?? undefined,
    },
  })

  async function onSubmit(values: CreateSupplierDto) {
    try {
      if (isEdit && supplier) {
        const result = await update.mutateAsync({
          dto: values,
          version: version ?? supplier.version,
        })
        toast.success('Supplier saved')
        router.push(`/suppliers/${result.supplier.id}`)
      } else {
        const created = await create.mutateAsync(values)
        toast.success('Supplier created', 'Onboarding starts in DRAFT.')
        router.push(`/suppliers/${created.id}`)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof SupplierFormInput, {
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
        title={isEdit ? 'Edit supplier' : 'New supplier'}
        {...(supplier ? { identifier: supplier.supplierCode } : {})}
        description={
          isEdit
            ? 'The supplier code cannot change once assigned.'
            : 'Onboarding starts in DRAFT. Approval is a separate, administrator-only step.'
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={supplier ? `/suppliers/${supplier.id}` : '/suppliers'}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              form="supplier-form"
              variant="primary"
              loading={isSubmitting}
              disabled={isEdit && !isDirty}
            >
              {isEdit ? 'Save changes' : 'Create supplier'}
            </Button>
          </>
        }
      />

      <form id="supplier-form" onSubmit={handleSubmit(onSubmit)} className="p-gutter">
        <div className="mx-auto grid max-w-3xl gap-gutter">
          {Object.keys(errors).length > 0 ? (
            <Alert tone="danger" title="Check the highlighted fields" />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-2">
              <Field
                label="Supplier code"
                required
                error={errors.supplierCode?.message}
                htmlFor="supplierCode"
              >
                <Input
                  id="supplierCode"
                  {...register('supplierCode')}
                  invalid={Boolean(errors.supplierCode)}
                  disabled={isEdit}
                  placeholder="SUP-000001"
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Business type"
                required
                error={errors.businessType?.message}
                htmlFor="businessType"
              >
                <Select
                  value={watch('businessType')}
                  onValueChange={(value) =>
                    setValue('businessType', value as SupplierFormInput['businessType'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="businessType" invalid={Boolean(errors.businessType)}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_BUSINESS_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Company name"
                required
                error={errors.companyName?.message}
                htmlFor="companyName"
              >
                <Input
                  id="companyName"
                  {...register('companyName')}
                  invalid={Boolean(errors.companyName)}
                />
              </Field>

              <Field
                label="Legal name"
                required
                error={errors.legalName?.message}
                htmlFor="legalName"
              >
                <Input
                  id="legalName"
                  {...register('legalName')}
                  invalid={Boolean(errors.legalName)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-2">
              <Field label="Email" error={errors.email?.message} htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  {...register('email', optionalText)}
                  invalid={Boolean(errors.email)}
                />
              </Field>
              <Field label="Phone" error={errors.phone?.message} htmlFor="phone">
                <Input
                  id="phone"
                  {...register('phone', optionalText)}
                  invalid={Boolean(errors.phone)}
                />
              </Field>
              <Field
                label="Website"
                error={errors.website?.message}
                htmlFor="website"
                className="sm:col-span-2"
              >
                <Input
                  id="website"
                  {...register('website', optionalText)}
                  invalid={Boolean(errors.website)}
                  placeholder="https://"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-3">
              <Field
                label="Country"
                error={errors.country?.message}
                htmlFor="country"
                hint="ISO alpha-2"
              >
                <Input
                  id="country"
                  {...register('country', optionalText)}
                  invalid={Boolean(errors.country)}
                  maxLength={2}
                  className="uppercase"
                />
              </Field>
              <Field label="State" error={errors.state?.message} htmlFor="state">
                <Input
                  id="state"
                  {...register('state', optionalText)}
                  invalid={Boolean(errors.state)}
                />
              </Field>
              <Field label="City" error={errors.city?.message} htmlFor="city">
                <Input
                  id="city"
                  {...register('city', optionalText)}
                  invalid={Boolean(errors.city)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registrations</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-3">
              <Field
                label="GST"
                error={errors.gstNumber?.message}
                htmlFor="gstNumber"
                hint="Unique per tenant"
              >
                <Input
                  id="gstNumber"
                  {...register('gstNumber', optionalText)}
                  invalid={Boolean(errors.gstNumber)}
                  className="uppercase"
                />
              </Field>
              <Field label="IEC" error={errors.iecNumber?.message} htmlFor="iecNumber">
                <Input
                  id="iecNumber"
                  {...register('iecNumber', optionalText)}
                  invalid={Boolean(errors.iecNumber)}
                  className="uppercase"
                />
              </Field>
              <Field label="PAN" error={errors.panNumber?.message} htmlFor="panNumber">
                <Input
                  id="panNumber"
                  {...register('panNumber', optionalText)}
                  invalid={Boolean(errors.panNumber)}
                  className="uppercase"
                />
              </Field>
            </CardContent>
          </Card>
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
