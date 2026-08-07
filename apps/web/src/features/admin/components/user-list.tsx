'use client'

import {
  Avatar,
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableLayout,
  DataTableRow,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  PageHeader,
  PaginationControls,
  SkeletonTable,
} from '@triyara/ui'
import { MoreHorizontal, SearchX, ShieldAlert, UserPlus, Users } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useMemo, useState } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'
import { SortableHeader } from '@/components/data/sortable-header'
import { useAbility } from '@/lib/ability-context'
import { useListState } from '@/lib/list-state'

import { type AdminUsersQuery, useAdminUsers } from '../api/users'
import type { AdminUser, RoleName, UserStatus } from '../types'
import { InviteUserDialog } from './invite-user-dialog'
import { formatWhen, RoleBadges, StatusTone } from './user-presentation'

const DEFAULTS: Partial<AdminUsersQuery> = { limit: '25' }

const STATUSES: UserStatus[] = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']
const ROLES: RoleName[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']

/**
 * Users list (TRY-BNP-PORTAL-01 §12).
 *
 * ADMIN only, matching the endpoint behind it: `GET /api/v1/admin/users`
 * requires `manage User`, so a lesser role would receive 403 rather than a
 * shorter list. The screen says that plainly instead of rendering an empty
 * table that reads like "this organization has no people".
 */
export function UserList() {
  const ability = useAbility()
  const canRead = ability.can('manage', 'User')
  const [inviting, setInviting] = useState(false)

  const { params, setFilter, nextPage, previousPage, hasPrevious, isFiltered, reset } =
    useListState<AdminUsersQuery>(DEFAULTS)

  const query = useMemo(
    () => ({
      limit: params.limit ?? '25',
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.role ? { role: params.role } : {}),
      ...(params.sort ? { sort: params.sort } : {}),
    }),
    [params],
  )

  const users = useAdminUsers(query)
  const items = users.data?.items ?? []
  const pagination = users.data?.meta.pagination

  if (!canRead) {
    return (
      <>
        <PageHeader title="Users" />
        <div className="p-gutter">
          <EmptyState
            variant="error"
            icon={<ShieldAlert />}
            title="Only administrators can manage users"
            description="This list carries account status, roles and sign-in history, so it is restricted above ordinary read access."
          />
        </div>
      </>
    )
  }

  let state: ReactNode
  if (users.isPending) state = <SkeletonTable rows={10} columns={6} />
  else if (users.isError)
    state = (
      <QueryBoundary
        isPending={false}
        isError
        error={users.error}
        data={items}
        onRetry={() => void users.refetch()}
      >
        {() => null}
      </QueryBoundary>
    )
  else if (items.length === 0)
    state = isFiltered ? (
      <EmptyState
        variant="filtered"
        icon={<SearchX />}
        title="No people match these filters"
        action={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Users />}
        title="No people in this organization yet"
        action={
          <Button variant="primary" leadingIcon={<UserPlus />} onClick={() => setInviting(true)}>
            Invite user
          </Button>
        }
      />
    )

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone in this organization, what they may do, and when they last signed in."
        actions={
          <Button variant="primary" leadingIcon={<UserPlus />} onClick={() => setInviting(true)}>
            Invite user
          </Button>
        }
      />
      <InviteUserDialog open={inviting} onOpenChange={setInviting} />

      <div className="p-gutter">
        <DataTableLayout
          className="max-h-[calc(100vh-14rem)]"
          toolbar={
            <>
              <DebouncedSearch
                aria-label="Search people by name or email"
                placeholder="Search name or email…"
                value={params.q ?? ''}
                onChange={(value) => setFilter('q', value || undefined)}
                className="max-w-xs"
                resultSummary={
                  users.isPending
                    ? undefined
                    : `${items.length} ${items.length === 1 ? 'person' : 'people'} on this page`
                }
              />
              <FilterSelect
                label="Status"
                allLabel="All statuses"
                value={params.status}
                onChange={(value) => setFilter('status', value)}
                options={STATUSES.map((s) => ({ value: s, label: humanise(s) }))}
                className="w-44"
              />
              <FilterSelect
                label="Role"
                allLabel="All roles"
                value={params.role}
                onChange={(value) => setFilter('role', value)}
                options={ROLES.map((r) => ({ value: r, label: humanise(r) }))}
                className="w-48"
              />
              {isFiltered ? (
                <Button size="sm" variant="ghost" onClick={reset}>
                  Clear filters
                </Button>
              ) : null}
            </>
          }
          {...(state ? { state } : {})}
          footer={
            <PaginationControls
              count={items.length}
              limit={Number(params.limit ?? 25)}
              onLimitChange={(limit) => setFilter('limit', String(limit))}
              nextCursor={pagination?.nextCursor ?? null}
              hasPrevious={hasPrevious}
              onNext={() => pagination?.nextCursor && nextPage(pagination.nextCursor)}
              onPrevious={previousPage}
            />
          }
        >
          <DataTable caption="People in this organization">
            <DataTableHead>
              <tr>
                <SortableHeader
                  label="Name"
                  sortKey="name"
                  currentSort={params.sort}
                  onSort={(next) => setFilter('sort', next)}
                />
                <SortableHeader
                  label="Email"
                  sortKey="email"
                  currentSort={params.sort}
                  onSort={(next) => setFilter('sort', next)}
                />
                <th scope="col">Status</th>
                <th scope="col">Roles</th>
                <th scope="col">Last sign-in</th>
                <SortableHeader
                  label="Added"
                  sortKey="createdAt"
                  currentSort={params.sort}
                  onSort={(next) => setFilter('sort', next)}
                />
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </tbody>
          </DataTable>
        </DataTableLayout>
      </div>
    </>
  )
}

function UserRow({ user }: { user: AdminUser }) {
  return (
    <DataTableRow>
      <DataTableCell>
        <Link
          href={`/admin/users/${user.id}`}
          className="focus-ring flex min-w-0 items-center gap-gap rounded-sm"
        >
          <Avatar size="sm" {...(user.avatarUrl ? { src: user.avatarUrl } : {})} name={user.name} />
          <span className="min-w-0 truncate font-medium text-content">{user.name}</span>
        </Link>
      </DataTableCell>
      <DataTableCell className="truncate text-sm text-content-muted">{user.email}</DataTableCell>
      <DataTableCell>
        <Badge size="sm" tone={StatusTone[user.status]}>
          {humanise(user.status)}
        </Badge>
      </DataTableCell>
      <DataTableCell>
        <RoleBadges roles={user.roles} />
      </DataTableCell>
      <DataTableCell className="whitespace-nowrap text-sm text-content-muted">
        {formatWhen(user.lastLoginAt)}
      </DataTableCell>
      <DataTableCell className="whitespace-nowrap text-sm text-content-muted">
        {formatWhen(user.createdAt)}
      </DataTableCell>
      <DataTableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Actions for ${user.name}`}
              className="px-2"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          {/* Only what this screen can actually do. Suspending or deleting a
              user has no endpoint, so no menu item promises it. */}
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/admin/users/${user.id}`}>Open profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/admin/users/${user.id}?tab=roles`}>Manage roles</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/admin/users/${user.id}?tab=sessions`}>View sessions</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DataTableCell>
    </DataTableRow>
  )
}

/** ROLE_NAME and STATUS tokens read badly in prose; title-case them. */
export function humanise(token: string): string {
  return token
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
