'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Avatar,
  Badge,
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
  type ChangePasswordDto,
  changePasswordSchema,
  type UpdateProfileDto,
  updateProfileSchema,
} from '@triyara/validation'
import { useForm } from 'react-hook-form'

import { InlineQueryError } from '@/components/data/query-boundary'
import { RequestAccessCard } from '@/features/admin-access/components/request-access-card'
import { useDirtyGuard } from '@/features/quotations/components/use-dirty-guard'
import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useChangePassword, useProfile, useUpdateProfile } from '../api/admin'
import type { Profile as ProfileRecord } from '../types'

/**
 * My profile (§9, §18).
 *
 * Email and roles are shown but not editable, and the screen says why rather
 * than leaving a greyed-out box to be puzzled over: email is the login
 * identifier, and roles are granted by an administrator. The API accepts
 * neither, so a form that offered them would be promising something the server
 * would silently drop.
 *
 * Password is a separate form and a separate request, because it carries a
 * requirement the rest of the profile does not - the current password must be
 * proved. Mixing it into the same submit would mean asking for a password to
 * change an avatar.
 */
/** Loads, then hands the record to the form. See OrganizationSettings for why. */
export function Profile() {
  const profile = useProfile()

  if (profile.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-48" />
        <Skeleton className="mt-gap-lg h-64 w-full max-w-3xl" />
      </div>
    )

  if (profile.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={profile.error} onRetry={() => void profile.refetch()} />
      </div>
    )

  return (
    <>
      <ProfileForm me={profile.data} />
      {/* Asking for administrator access belongs with the rest of "you":
          it is about this person's own standing, not about administering
          anyone else. Hidden entirely from those who already hold ADMIN. */}
      <div className="px-gutter pb-gutter">
        <RequestAccessCard />
      </div>
    </>
  )
}

function ProfileForm({ me }: { me: ProfileRecord }) {
  const toast = useToast()
  const update = useUpdateProfile()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileDto>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: me.name ?? '',
      avatarUrl: me.avatarUrl,
      preferences: me.preferences ?? {},
    },
  })

  useDirtyGuard(isDirty && !isSubmitting)

  const preferences = (watch('preferences') ?? {}) as Record<string, unknown>

  async function onSubmit(values: UpdateProfileDto) {
    try {
      await update.mutateAsync(values)
      reset(values)
      toast.success('Profile saved')
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof UpdateProfileDto, {
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

  const setPreference = (key: string, value: unknown) =>
    setValue('preferences', { ...preferences, [key]: value }, { shouldDirty: true })

  return (
    <>
      <PageHeader
        title="My profile"
        description="How you appear to colleagues, and how this application behaves for you."
        actions={
          <>
            <Button variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => reset()}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="profile-form"
              variant="primary"
              loading={isSubmitting}
              disabled={!isDirty}
            >
              Save changes
            </Button>
          </>
        }
      />

      <div className="p-gutter">
        <div className="mx-auto grid max-w-3xl gap-gutter">
          {isDirty && !isSubmitting ? (
            <p className="text-xs text-content-subtle" role="status">
              Unsaved changes. Leaving this page will discard them.
            </p>
          ) : null}

          <form id="profile-form" onSubmit={handleSubmit(onSubmit)} className="grid gap-gutter">
            <Card>
              <CardHeader>
                <CardTitle as="h2">Identity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-gap-lg">
                <div className="flex items-center gap-gap-lg">
                  <Avatar
                    size="lg"
                    {...(watch('avatarUrl') ? { src: watch('avatarUrl') as string } : {})}
                    name={me.name ?? me.email}
                  />
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="avatarUrl">Avatar URL</Label>
                    <Input
                      id="avatarUrl"
                      className="mt-gap-xs"
                      placeholder="https://…"
                      {...register('avatarUrl', {
                        setValueAs: (v: unknown) => (v === '' ? null : v),
                      })}
                      invalid={Boolean(errors.avatarUrl)}
                    />
                    {errors.avatarUrl ? (
                      <p className="mt-gap-xs text-xs text-danger" role="alert">
                        {errors.avatarUrl.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <Label htmlFor="name" required>
                    Display name
                  </Label>
                  <Input
                    id="name"
                    className="mt-gap-xs"
                    {...register('name')}
                    invalid={Boolean(errors.name)}
                  />
                  {errors.name ? (
                    <p className="mt-gap-xs text-xs text-danger" role="alert">
                      {errors.name.message}
                    </p>
                  ) : null}
                </div>

                {/* Shown, not editable - and the reason is stated rather than
                    left as an unexplained disabled input. */}
                <dl className="grid gap-gap rounded-md border border-line bg-surface-sunken px-gap-lg py-gap-lg">
                  <div className="flex items-baseline justify-between gap-gap-lg">
                    <dt className="text-xs text-content-muted">Email</dt>
                    <dd className="text-sm text-content">{me.email}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-gap-lg">
                    <dt className="text-xs text-content-muted">Roles</dt>
                    <dd className="flex flex-wrap gap-gap-xs">
                      {me.roles.map((r) => (
                        <Badge key={r} size="sm" tone="neutral">
                          {r}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                </dl>
                {/* Outside the <dl>: a definition list may only contain dt, dd
                    and div groups, and a div holding prose is not one. */}
                <p className="-mt-gap text-2xs text-content-subtle">
                  Your email is your sign-in identifier and your roles are granted by an
                  administrator, so neither can be changed here.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h2">Preferences</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-gap-lg sm:grid-cols-2">
                <div>
                  <Label htmlFor="pref-density">Table density</Label>
                  <Select
                    value={(preferences.density as string) ?? 'comfortable'}
                    onValueChange={(v) => setPreference('density', v)}
                  >
                    <SelectTrigger id="pref-density" className="mt-gap-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="pref-landing">Landing screen</Label>
                  <Select
                    value={(preferences.landing as string) ?? 'dashboard'}
                    onValueChange={(v) => setPreference('landing', v)}
                  >
                    <SelectTrigger id="pref-landing" className="mt-gap-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dashboard">Dashboard</SelectItem>
                      <SelectItem value="rfqs">RFQs</SelectItem>
                      <SelectItem value="quotations">Quotations</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </form>

          <PasswordForm />
        </div>
      </div>
    </>
  )
}

/** Its own form and its own request: changing a password proves the old one. */
function PasswordForm() {
  const toast = useToast()
  const change = useChangePassword()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordDto>({ resolver: zodResolver(changePasswordSchema) })

  async function onSubmit(values: ChangePasswordDto) {
    try {
      await change.mutateAsync(values)
      reset({ currentPassword: '', newPassword: '' })
      toast.success('Password changed')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        // The server refuses without saying which field; attribute it to the
        // one the user can actually fix.
        setError('currentPassword', {
          type: 'server',
          message: 'That is not your current password.',
        })
        return
      }
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
        ...(described.requestId ? { requestId: described.requestId } : {}),
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-gap-lg sm:max-w-md">
          <Alert tone="info" title="Your current password is required">
            Proving the current password stops a borrowed session from locking you out of your own
            account.
          </Alert>

          <div>
            <Label htmlFor="currentPassword" required>
              Current password
            </Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              className="mt-gap-xs"
              {...register('currentPassword')}
              invalid={Boolean(errors.currentPassword)}
            />
            {errors.currentPassword ? (
              <p className="mt-gap-xs text-xs text-danger" role="alert">
                {errors.currentPassword.message}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="newPassword" required>
              New password
            </Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className="mt-gap-xs"
              {...register('newPassword')}
              invalid={Boolean(errors.newPassword)}
            />
            {errors.newPassword ? (
              <p className="mt-gap-xs text-xs text-danger" role="alert">
                {errors.newPassword.message}
              </p>
            ) : (
              <p className="mt-gap-xs text-xs text-content-subtle">
                At least 12 characters, with an uppercase letter, a lowercase letter and a digit.
              </p>
            )}
          </div>

          <div>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
