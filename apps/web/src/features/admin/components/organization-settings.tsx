'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Avatar,
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
  Skeleton,
  useToast,
} from '@triyara/ui'
import {
  DATE_FORMATS,
  UI_LANGUAGES,
  type UpdateOrganizationDto,
  updateOrganizationSchema,
} from '@triyara/validation'
import { useForm } from 'react-hook-form'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useDirtyGuard } from '@/features/quotations/components/use-dirty-guard'
import { useAbility } from '@/lib/ability-context'
import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useOrganization, useUpdateOrganization } from '../api/admin'
import type { Organization as OrganizationRecord } from '../types'

/** A small, honest set. The API accepts any ISO 4217 code; these are the ones this desk trades in. */
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'JPY']

const TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'Australia/Sydney',
]

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी',
  ar: 'العربية',
  fr: 'Français',
  es: 'Español',
}

/**
 * Organization settings (§9, §18).
 *
 * These govern PRESENTATION only, and the screen says so. A quotation stores
 * its own currency and a sent one is a commitment, so changing the default here
 * proposes a currency for the next document - it does not restate what a buyer
 * was already quoted. Users get that wrong when a settings screen implies
 * otherwise by silence.
 *
 * Writing needs `manage Organization` (ADMIN). A lesser role sees the settings -
 * they explain how dates and money will be shown to them - with every control
 * disabled, rather than a blank screen that looks like a fault.
 */
/**
 * Loads, then hands the record to the form.
 *
 * The form takes its data as a prop and seeds `defaultValues` once, rather than
 * feeding a live query in through `values`. That is what keeps `isDirty`
 * honest: a form whose defaults arrive after first render can report itself
 * dirty before the user has touched anything, and then Save is enabled with
 * nothing to save.
 */
export function OrganizationSettings() {
  const organization = useOrganization()

  if (organization.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton className="mt-gap-lg h-64 w-full max-w-3xl" />
      </div>
    )

  if (organization.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={organization.error} onRetry={() => void organization.refetch()} />
      </div>
    )

  return <OrganizationForm organization={organization.data} />
}

function OrganizationForm({ organization }: { organization: OrganizationRecord }) {
  const toast = useToast()
  const ability = useAbility()
  const canWrite = ability.can('manage', 'Organization')

  const update = useUpdateOrganization()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateOrganizationDto>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: organization.name,
      logoUrl: organization.logoUrl,
      defaultCurrency: organization.defaultCurrency,
      timezone: organization.timezone,
      dateFormat: organization.dateFormat as UpdateOrganizationDto['dateFormat'],
      language: organization.language as UpdateOrganizationDto['language'],
    },
  })

  useDirtyGuard(isDirty && !isSubmitting)

  async function onSubmit(values: UpdateOrganizationDto) {
    try {
      await update.mutateAsync(values)
      // Reset to the saved values so the form is clean again and the unsaved
      // warning stops firing.
      reset(values)
      toast.success('Settings saved')
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof UpdateOrganizationDto, {
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

  const logoUrl = watch('logoUrl')

  return (
    <>
      <PageHeader
        title="Organization"
        identifier={organization.slug}
        description="How this organization is named and how dates and money are shown."
        actions={
          canWrite ? (
            <>
              <Button variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => reset()}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="organization-form"
                variant="primary"
                loading={isSubmitting}
                disabled={!isDirty}
              >
                Save changes
              </Button>
            </>
          ) : undefined
        }
      />

      <form id="organization-form" onSubmit={handleSubmit(onSubmit)} className="p-gutter">
        <div className="mx-auto grid max-w-3xl gap-gutter">
          {!canWrite ? (
            <Alert tone="info" title="You can see these settings but not change them">
              Changing organization settings requires an administrator.
            </Alert>
          ) : null}

          {isDirty && !isSubmitting ? (
            <p className="text-xs text-content-subtle" role="status">
              Unsaved changes. Leaving this page will discard them.
            </p>
          ) : null}

          {Object.keys(errors).length > 0 ? (
            <Alert tone="danger" title="Check the highlighted fields" />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle as="h2">Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg">
              <Field label="Company name" htmlFor="name" error={errors.name?.message} required>
                <Input
                  id="name"
                  {...register('name')}
                  invalid={Boolean(errors.name)}
                  disabled={!canWrite}
                />
              </Field>

              <Field
                label="Logo URL"
                htmlFor="logoUrl"
                error={errors.logoUrl?.message}
                hint="Shown in the sidebar and on generated documents."
              >
                <div className="flex items-center gap-gap-lg">
                  <Avatar
                    size="lg"
                    {...(logoUrl ? { src: logoUrl } : {})}
                    name={organization.name}
                  />
                  <Input
                    id="logoUrl"
                    className="flex-1"
                    placeholder="https://…"
                    {...register('logoUrl', {
                      setValueAs: (v: unknown) => (v === '' ? null : v),
                    })}
                    invalid={Boolean(errors.logoUrl)}
                    disabled={!canWrite}
                  />
                </div>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Presentation</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-gap-lg sm:grid-cols-2">
              <Field
                label="Default currency"
                htmlFor="defaultCurrency"
                error={errors.defaultCurrency?.message}
                hint="Proposed for new documents. Existing ones keep their own."
              >
                <Select
                  value={watch('defaultCurrency') ?? 'USD'}
                  onValueChange={(v) =>
                    setValue('defaultCurrency', v, { shouldDirty: true, shouldValidate: true })
                  }
                  disabled={!canWrite}
                >
                  <SelectTrigger id="defaultCurrency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}>
                <Select
                  value={watch('timezone') ?? 'UTC'}
                  onValueChange={(v) =>
                    setValue('timezone', v, { shouldDirty: true, shouldValidate: true })
                  }
                  disabled={!canWrite}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Date format" htmlFor="dateFormat" error={errors.dateFormat?.message}>
                <Select
                  value={watch('dateFormat') ?? 'DD/MM/YYYY'}
                  onValueChange={(v) =>
                    setValue('dateFormat', v as UpdateOrganizationDto['dateFormat'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={!canWrite}
                >
                  <SelectTrigger id="dateFormat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Language" htmlFor="language" error={errors.language?.message}>
                <Select
                  value={watch('language') ?? 'en'}
                  onValueChange={(v) =>
                    setValue('language', v as UpdateOrganizationDto['language'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={!canWrite}
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UI_LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LANGUAGE_NAMES[l] ?? l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
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
