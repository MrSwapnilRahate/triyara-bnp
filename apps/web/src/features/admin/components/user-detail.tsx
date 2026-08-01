'use client'

import {
  Avatar,
  Badge,
  Breadcrumb,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@triyara/ui'
import { ShieldAlert, UserX } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'

import { useAdminUser } from '../api/users'
import { humanise } from './user-list'
import { UserLoginActivityTab } from './user-login-activity-tab'
import { UserPermissionsTab } from './user-permissions-tab'
import { formatWhen, StatusTone } from './user-presentation'
import { UserRolesTab } from './user-roles-tab'
import { UserSessionsTab } from './user-sessions-tab'

const TABS = ['overview', 'roles', 'sessions', 'activity', 'permissions'] as const
type Tab = (typeof TABS)[number]

/**
 * One person (TRY-BNP-PORTAL-01 §12).
 *
 * The active tab lives in the URL so a link to someone's sessions is a link a
 * colleague can be sent, and so the browser's back button steps between tabs
 * the way a reader expects.
 */
export function UserDetail({ id }: { id: string }) {
  const ability = useAbility()
  const canRead = ability.can('manage', 'User')

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const requested = searchParams?.get('tab')
  const fromUrl: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'overview'

  // Local state, seeded from the URL and written back to it. The tab responds
  // immediately rather than waiting on a router round-trip, and a link to
  // ?tab=sessions still opens on that tab.
  const [tab, setTab] = useState<Tab>(fromUrl)
  useEffect(() => setTab(fromUrl), [fromUrl])

  const user = useAdminUser(id)

  if (!canRead) {
    return (
      <>
        <PageHeader title="User" />
        <div className="p-gutter">
          <EmptyState
            variant="error"
            icon={<ShieldAlert />}
            title="Only administrators can manage users"
            description="This screen carries roles, sessions and sign-in history."
          />
        </div>
      </>
    )
  }

  if (user.isPending) {
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-7 w-64" />
        <Skeleton className="mt-gap-lg h-96 w-full" />
      </div>
    )
  }

  if (user.isError) {
    return (
      <div className="p-gutter">
        <InlineQueryError error={user.error} onRetry={() => void user.refetch()} />
      </div>
    )
  }

  if (!user.data) {
    return (
      <>
        <PageHeader title="User" />
        <div className="p-gutter">
          <EmptyState
            icon={<UserX />}
            title="No such person in this organization"
            description="They may have been removed, or the link may point at another tenant."
          />
        </div>
      </>
    )
  }

  const person = user.data

  function selectTab(next: string) {
    setTab(next as Tab)
    const search = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'overview') search.delete('tab')
    else search.set('tab', next)
    const query = search.toString()
    router.replace(query ? `${pathname}?${query}` : (pathname ?? ''), { scroll: false })
  }

  return (
    <>
      <PageHeader
        title={person.name}
        description={person.email}
        breadcrumb={
          <Breadcrumb
            linkComponent={Link}
            items={[{ label: 'Users', href: '/admin/users' }, { label: person.name }]}
          />
        }
        status={
          <Badge size="sm" tone={StatusTone[person.status]}>
            {humanise(person.status)}
          </Badge>
        }
        actions={
          <Avatar
            size="lg"
            {...(person.avatarUrl ? { src: person.avatarUrl } : {})}
            name={person.name}
          />
        }
      />

      <div className="p-gutter">
        <Tabs value={tab} onValueChange={selectTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="activity">Login activity</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              person={person}
              organizationName={person.email.split('@')[1] ?? 'This organization'}
            />
          </TabsContent>
          <TabsContent value="roles">
            <UserRolesTab userId={id} />
          </TabsContent>
          <TabsContent value="sessions">
            <UserSessionsTab userId={id} />
          </TabsContent>
          <TabsContent value="activity">
            <UserLoginActivityTab userId={id} />
          </TabsContent>
          <TabsContent value="permissions">
            <UserPermissionsTab roles={person.roles} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

function OverviewTab({
  person,
  organizationName,
}: {
  person: NonNullable<ReturnType<typeof useAdminUser>['data']>
  organizationName: string
}) {
  // A definition list, because that is what this is: labelled facts about one
  // record, not a table of many.
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Display name', value: person.name },
    { label: 'Email', value: person.email },
    { label: 'Status', value: humanise(person.status) },
    { label: 'Organization', value: organizationName },
    { label: 'Added', value: formatWhen(person.createdAt) },
    { label: 'Last sign-in', value: formatWhen(person.lastLoginAt) },
  ]

  return (
    <div className="mt-gap-lg max-w-3xl">
      <dl className="grid divide-y divide-line rounded-md border border-line bg-surface">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline gap-gap-lg px-gutter py-gap-lg">
            <dt className="w-40 shrink-0 text-xs text-content-muted">{fact.label}</dt>
            <dd className="min-w-0 flex-1 break-words text-sm text-content">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {/* `updatedAt` is not among the fields the admin users endpoint returns,
          and this screen does not invent one. Said plainly rather than shown as
          an empty row a reader would take for "never changed". */}
      <p className="mt-gap text-2xs text-content-subtle">
        The API does not expose a last-modified timestamp for a person, so none is shown.
      </p>
    </div>
  )
}
