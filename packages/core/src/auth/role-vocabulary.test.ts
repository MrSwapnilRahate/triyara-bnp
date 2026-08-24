import {
  ASSIGNABLE_ROLES,
  assignableRoleSchema,
  assignBaseRoleSchema,
  GRANTABLE_ROLES,
  grantScopedRoleSchema,
  inviteUserSchema,
  listAdminUsersQuerySchema,
} from '@triyara/validation'
import { describe, expect, it } from 'vitest'

/**
 * Two vocabularies, and the line between them.
 *
 * What a role may be CALLED still includes ADMIN - you have to be able to list
 * the administrators and to take the role back. What a request may ASK FOR does
 * not, because ADMIN is granted in exactly one way: a Super Admin approving an
 * access request.
 */

const GRANT_BODIES = [
  [
    'invite a colleague',
    (role: string) => inviteUserSchema.safeParse({ name: 'A', email: 'a@b.co', role }),
  ],
  ['assign a base role', (role: string) => assignBaseRoleSchema.safeParse({ role })],
  [
    'grant a scoped role',
    (role: string) =>
      grantScopedRoleSchema.safeParse({ userId: 'u1', role, scopeType: 'ACCOUNT', scopeId: 'a1' }),
  ],
] as const

describe('a granting request cannot ask for ADMIN', () => {
  it.each(GRANT_BODIES)('rejects ADMIN when you %s', (_label, parse) => {
    expect(parse('ADMIN').success).toBe(false)
  })

  it.each(GRANT_BODIES)('still accepts the operational roles when you %s', (_label, parse) => {
    for (const role of ['EXPORTER', 'VERIFIER', 'READ_ONLY']) {
      expect(parse(role).success, `${role} must remain grantable`).toBe(true)
    }
  })

  it('offers exactly the three operational roles', () => {
    expect([...GRANTABLE_ROLES]).toEqual(['EXPORTER', 'VERIFIER', 'READ_ONLY'])
    expect(GRANTABLE_ROLES).not.toContain('ADMIN')
  })
})

describe('ADMIN remains a name the system can still say', () => {
  it('keeps ADMIN in the full vocabulary', () => {
    expect([...ASSIGNABLE_ROLES]).toContain('ADMIN')
  })

  it('parses ADMIN where a role is being revoked', () => {
    // The DELETE route validates its path segment against this schema. Drop
    // ADMIN from it and the role becomes impossible to take away, which is a
    // worse failure than the one being fixed.
    expect(assignableRoleSchema.safeParse('ADMIN').success).toBe(true)
  })

  it('lets an administrator filter the user list by ADMIN', () => {
    const parsed = listAdminUsersQuerySchema.safeParse({ role: 'ADMIN' })
    expect(parsed.success).toBe(true)
  })

  it('rejects a role name that does not exist, in both vocabularies', () => {
    expect(assignableRoleSchema.safeParse('SUPER_ADMIN').success).toBe(false)
    expect(assignBaseRoleSchema.safeParse({ role: 'SUPER_ADMIN' }).success).toBe(false)
  })
})
