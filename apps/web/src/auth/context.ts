import {
  type Action,
  assertAbility,
  assertRole,
  type AuthContext,
  type AuthUser,
  resolveContext,
  type Role,
  type Subject,
} from '@triyara/auth'
import { type Organization, organizationRepository } from '@triyara/db'
import { UnauthenticatedError } from '@triyara/lib'

import { auth } from './index'

async function loadContext(): Promise<AuthContext> {
  const session = await auth()
  if (!session?.user) throw new UnauthenticatedError()
  const u = session.user
  const authUser: AuthUser = {
    id: u.id,
    organizationId: u.organizationId,
    email: u.email ?? '',
    name: u.name ?? '',
    roles: u.roles,
  }
  return resolveContext({ user: authUser })
}

export function requireAuth(): Promise<AuthContext> {
  return loadContext()
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  return assertRole(await loadContext(), ...roles)
}

export async function requireAbility(action: Action, subject: Subject): Promise<AuthContext> {
  return assertAbility(await loadContext(), action, subject)
}

export async function currentUser(): Promise<AuthUser | null> {
  const session = await auth()
  if (!session?.user) return null
  const u = session.user
  return {
    id: u.id,
    organizationId: u.organizationId,
    email: u.email ?? '',
    name: u.name ?? '',
    roles: u.roles,
  }
}

export async function currentOrganization(): Promise<Organization | null> {
  const user = await currentUser()
  if (!user) return null
  return organizationRepository.findById(user.organizationId)
}
