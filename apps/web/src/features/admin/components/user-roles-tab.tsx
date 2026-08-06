'use client'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useToast,
} from '@triyara/ui'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import { useProfile } from '../api/admin'
import {
  useAssignRole,
  useRevokeRole,
  useRevokeScopedRole,
  useUserRoles,
  useUserScopedRoles,
} from '../api/users'
import type { RoleName } from '../types'
import { formatWhen, roleLabel } from './user-presentation'

const ASSIGNABLE: RoleName[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']

/**
 * Base roles and scoped grants (TRY-BNP-PORTAL-01 §12).
 *
 * Base roles are what the session carries and CASL derives ability from; scoped
 * grants add a role on one resource. Both are shown, and the difference is
 * stated, because an administrator who confuses them will grant the wrong thing.
 *
 * The two refusals the API enforces - you cannot remove your own administrator
 * role, and an organization cannot lose its last one - are surfaced BEFORE the
 * request where the client can already know the answer, and reported from the
 * server's own message where it cannot. The button is never simply disabled
 * with no reason given.
 */
export function UserRolesTab({ userId }: { userId: string }) {
  const ability = useAbility()
  const canWrite = ability.can('manage', 'User')
  // The caller's own id, so the self-revoke refusal can be shown before the
  // request rather than only reported after it. Reuses the profile query the
  // Profile screen already loads, rather than adding a session context.
  const me = useProfile()
  const toast = useToast()

  const roles = useUserRoles(userId)
  const scoped = useUserScopedRoles(userId)
  const assign = useAssignRole(userId)
  const revoke = useRevokeRole(userId)
  const revokeScoped = useRevokeScopedRole(userId)

  const [pending, setPending] = useState<RoleName | null>(null)
  const [choice, setChoice] = useState<RoleName | ''>('')

  const held = roles.data ?? []
  const heldNames = held.map((r) => r.name)
  const available = ASSIGNABLE.filter((r) => !heldNames.includes(r))

  const isSelf = me.data?.id === userId

  async function onAssign() {
    if (!choice) return
    try {
      await assign.mutateAsync(choice)
      toast.success(`${roleLabel(choice)} granted`)
      setChoice('')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
        ...(described.requestId ? { requestId: described.requestId } : {}),
      })
    }
  }

  async function onRevoke(role: RoleName) {
    await revoke.mutateAsync(role)
    toast.success(`${roleLabel(role)} removed`)
  }

  if (roles.isPending) {
    return (
      <div className="mt-gap-lg" aria-busy="true">
        <Skeleton className="h-64 w-full max-w-3xl" />
      </div>
    )
  }
  if (roles.isError) {
    return (
      <div className="mt-gap-lg">
        <InlineQueryError error={roles.error} onRetry={() => void roles.refetch()} />
      </div>
    )
  }

  return (
    <div className="mt-gap-lg grid max-w-3xl gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Base roles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-gap-lg">
          <p className="text-xs text-content-muted">
            These decide what this person may do everywhere in the platform. Changing them takes
            effect the next time their session is issued.
          </p>

          {held.length === 0 ? (
            <Alert tone="warning" title="This person holds no roles">
              They can sign in, but every screen will refuse them.
            </Alert>
          ) : (
            <ul className="divide-y divide-line">
              {held.map((role) => {
                const blockedReason =
                  isSelf && role.name === 'ADMIN'
                    ? 'You cannot remove your own administrator role. Ask another administrator to do it.'
                    : null

                return (
                  <li
                    key={role.roleId}
                    className="flex items-center justify-between gap-gap-lg py-3"
                  >
                    <div className="min-w-0">
                      <Badge size="sm" tone={role.name === 'ADMIN' ? 'accent' : 'neutral'}>
                        {roleLabel(role.name)}
                      </Badge>
                      {blockedReason ? (
                        <p
                          id={`blocked-${role.roleId}`}
                          className="mt-gap-xs text-2xs text-content-subtle"
                        >
                          {blockedReason}
                        </p>
                      ) : null}
                    </div>

                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(blockedReason)}
                        {...(blockedReason ? { 'aria-describedby': `blocked-${role.roleId}` } : {})}
                        onClick={() => setPending(role.name)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          {canWrite && available.length > 0 ? (
            <div className="flex items-end gap-gap border-t border-line pt-4">
              <div className="min-w-0 flex-1">
                <label htmlFor="grant-role" className="text-xs text-content-muted">
                  Grant a role
                </label>
                <Select value={choice} onValueChange={(v) => setChoice(v as RoleName)}>
                  <SelectTrigger id="grant-role" className="mt-gap-xs">
                    <SelectValue placeholder="Choose a role…" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={!choice}
                loading={assign.isPending}
                onClick={() => void onAssign()}
              >
                Grant
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Scoped grants</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <p className="px-gutter pt-gap-lg text-xs text-content-muted">
            A scoped grant gives this person a role on one record only. It widens who holds a role;
            it never changes what the role means.
          </p>
          {scoped.isPending ? (
            <div className="p-gutter" aria-busy="true">
              <Skeleton variant="text" className="w-full" />
            </div>
          ) : scoped.isError ? (
            <div className="p-gutter">
              <InlineQueryError error={scoped.error} onRetry={() => void scoped.refetch()} />
            </div>
          ) : (scoped.data ?? []).length === 0 ? (
            <EmptyState size="sm" icon={<ShieldCheck />} title="No scoped grants" />
          ) : (
            <ul className="mt-gap-lg divide-y divide-line">
              {(scoped.data ?? []).map((grant) => (
                <li
                  key={grant.id}
                  className="flex items-center justify-between gap-gap-lg px-gutter py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-content">
                      {roleLabel(grant.role.name)} on{' '}
                      <span className="font-mono text-xs">
                        {grant.scopeType} {grant.scopeId}
                      </span>
                    </p>
                    <p className="text-2xs text-content-subtle">
                      Granted {formatWhen(grant.grantedAt)}
                      {grant.expiresAt ? ` · expires ${formatWhen(grant.expiresAt)}` : ''}
                      {grant.revokedAt ? ' · revoked' : ''}
                    </p>
                  </div>
                  {canWrite && !grant.revokedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={revokeScoped.isPending}
                      onClick={() =>
                        void revokeScoped
                          .mutateAsync({ id: grant.id, version: grant.version })
                          .then(() => toast.success('Scoped grant revoked'))
                          .catch((error: unknown) => {
                            const described = describeApiError(error)
                            toast.error(described.title)
                          })
                      }
                    >
                      Revoke
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Remove ${roleLabel(pending)}?` : ''}
        description={
          pending === 'ADMIN'
            ? 'They will lose administrator access everywhere in this organization. If they are the last administrator, the platform will refuse.'
            : 'They will lose the permissions this role carries the next time their session is issued.'
        }
        confirmLabel="Remove role"
        tone="danger"
        onConfirm={async () => {
          if (pending) await onRevoke(pending)
        }}
      />
    </div>
  )
}
