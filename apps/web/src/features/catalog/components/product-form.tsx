'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Combobox,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  useToast,
} from '@triyara/ui'
import { type CreateProductDto, createProductSchema, PRODUCT_STATUSES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useCreateProduct, useUpdateProduct } from '../api/products'
import { useCategories } from '../api/reference'
import type { Product } from '../types'

/**
 * An empty text input means "not provided", not "the empty string".
 *
 * Without this, leaving an optional field blank submits '' - which fails
 * `.length(2)` on countryOfOrigin and the digits regex on hsCode, and the user
 * sees a validation error on a field they deliberately left alone.
 */
const optionalText = { setValueAs: (value: unknown) => (value === '' ? undefined : value) }

type ProductFormInput = z.input<typeof createProductSchema>

export interface ProductFormProps {
  /** Absent for create; present for edit. */
  product?: Product
  version?: number
}

/**
 * Product create and edit (TRY-BNP-PORTAL-01 §18).
 *
 * Validates against `createProductSchema` from @triyara/validation - the SAME
 * object the API enforces. Client and server validation cannot drift, because
 * there is only one definition.
 *
 * Server 422s are mapped back onto their fields via `errors[].field`, so a
 * rejection lands on the input that caused it rather than in a toast.
 */
export function ProductForm({ product, version }: ProductFormProps) {
  const router = useRouter()
  const toast = useToast()
  const categories = useCategories()
  const isEdit = Boolean(product)

  const create = useCreateProduct()
  const update = useUpdateProduct(product?.id ?? '')

  // Three generics, not one: the schema applies .default() to `status` and
  // `isActive`, so its INPUT type has them optional while its OUTPUT type does
  // not. Collapsing the two is what makes zodResolver refuse to typecheck.
  const form = useForm<ProductFormInput, unknown, CreateProductDto>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      categoryId: product?.categoryId ?? '',
      shortDescription: product?.shortDescription ?? undefined,
      description: product?.description ?? undefined,
      brand: product?.brand ?? undefined,
      countryOfOrigin: product?.countryOfOrigin ?? undefined,
      hsCode: product?.hsCode ?? undefined,
      status: product?.status ?? 'DRAFT',
      isActive: product?.isActive ?? true,
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = form

  async function onSubmit(values: CreateProductDto) {
    try {
      if (isEdit && product) {
        const result = await update.mutateAsync({
          dto: values,
          version: version ?? product.version,
        })
        toast.success('Product saved')
        router.push(`/catalog/products/${result.product.id}`)
      } else {
        const created = await create.mutateAsync(values)
        toast.success('Product created')
        router.push(`/catalog/products/${created.id}`)
      }
    } catch (error) {
      // Field-level rejections land on their inputs; everything else becomes a
      // form-level banner plus a toast carrying the request id (§20).
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof ProductFormInput, {
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

  const categoryOptions = (categories.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    hint: c.path,
  }))

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit product' : 'New product'}
        {...(product ? { identifier: product.sku } : {})}
        description={
          isEdit
            ? 'Changes apply immediately. The SKU stays reserved even if the product is later removed.'
            : 'A product is the catalog entry that RFQ and quotation lines reference.'
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={product ? `/catalog/products/${product.id}` : '/catalog/products'}>
                Cancel
              </Link>
            </Button>
            <Button
              type="submit"
              form="product-form"
              variant="primary"
              loading={isSubmitting}
              disabled={isEdit && !isDirty}
            >
              {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      />

      <form id="product-form" onSubmit={handleSubmit(onSubmit)} className="p-gutter">
        <div className="mx-auto grid max-w-3xl gap-gutter">
          {Object.keys(errors).length > 0 ? (
            <Alert tone="danger" title="Check the highlighted fields">
              {Object.entries(errors)
                .map(([field, e]) => `${field}: ${e?.message as string}`)
                .join(' · ')}
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-2">
              <Field label="SKU" required error={errors.sku?.message} htmlFor="sku">
                <Input
                  id="sku"
                  {...register('sku')}
                  invalid={Boolean(errors.sku)}
                  placeholder="TRY-TUR-001"
                  autoComplete="off"
                />
              </Field>

              <Field label="Name" required error={errors.name?.message} htmlFor="name">
                <Input id="name" {...register('name')} invalid={Boolean(errors.name)} />
              </Field>

              <Field
                label="Category"
                required
                error={errors.categoryId?.message}
                htmlFor="categoryId"
                className="sm:col-span-2"
              >
                <Combobox
                  id="categoryId"
                  options={categoryOptions}
                  value={watch('categoryId') || null}
                  onValueChange={(value) =>
                    setValue('categoryId', value ?? '', { shouldDirty: true, shouldValidate: true })
                  }
                  loading={categories.isPending}
                  invalid={Boolean(errors.categoryId)}
                  placeholder="Select a category…"
                  emptyMessage="No categories. Create one first."
                />
              </Field>

              <Field label="Brand" error={errors.brand?.message} htmlFor="brand">
                <Input
                  id="brand"
                  {...register('brand', optionalText)}
                  invalid={Boolean(errors.brand)}
                />
              </Field>

              <Field label="Status" htmlFor="status">
                <Select
                  value={watch('status')}
                  onValueChange={(value) =>
                    setValue('status', value as CreateProductDto['status'], { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trade</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-2">
              <Field
                label="Country of origin"
                error={errors.countryOfOrigin?.message}
                htmlFor="countryOfOrigin"
                hint="ISO 3166-1 alpha-2, e.g. IN"
              >
                <Input
                  id="countryOfOrigin"
                  {...register('countryOfOrigin', optionalText)}
                  invalid={Boolean(errors.countryOfOrigin)}
                  maxLength={2}
                  className="uppercase"
                  placeholder="IN"
                />
              </Field>

              <Field
                label="HS code"
                error={errors.hsCode?.message}
                htmlFor="hsCode"
                hint="6–12 digits, unformatted"
              >
                <Input
                  id="hsCode"
                  {...register('hsCode', optionalText)}
                  invalid={Boolean(errors.hsCode)}
                  inputMode="numeric"
                  placeholder="091030"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg">
              <Field
                label="Short description"
                error={errors.shortDescription?.message}
                htmlFor="shortDescription"
              >
                <Input
                  id="shortDescription"
                  {...register('shortDescription', optionalText)}
                  invalid={Boolean(errors.shortDescription)}
                />
              </Field>
              <Field label="Description" error={errors.description?.message} htmlFor="description">
                <Textarea
                  id="description"
                  rows={6}
                  {...register('description', optionalText)}
                  invalid={Boolean(errors.description)}
                />
              </Field>
              <div className="flex items-center gap-gap">
                <Switch
                  id="isActive"
                  checked={watch('isActive')}
                  onCheckedChange={(checked) =>
                    setValue('isActive', checked, { shouldDirty: true })
                  }
                />
                <Label htmlFor="isActive">Active in the catalog</Label>
              </div>
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
