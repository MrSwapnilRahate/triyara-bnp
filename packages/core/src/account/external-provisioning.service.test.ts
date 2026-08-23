import { buildAbilityFor, type Role } from '@triyara/auth'
import type { AccountRecord, UserRepository, UserWithRoles } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import {
  createExternalProvisioningService,
  type ExternalProvisioningCtx,
} from './external-provisioning.service'

/**
 * Portal login provisioning.
 *
 * Backed by an in-memory store rather than assertions about mock calls. The
 * questions here are "does a second call create a second user", "did the role
 * that was written turn out to be EXTERNAL_PARTY", "is the refused user still
 * attached to the account they were already attached to" - none of which a
 * recorded call argument answers, because they are about the state afterwards.
 * A `toHaveBeenCalledWith` here would pass against a repository that dropped
 * every write.
 */

function ctxFor(roles: Role[]): ExternalProvisioningCtx {
  const user = { id: 'admin1', organizationId: 'org1', email: 'a@b.com', name: 'An Admin', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function accountRow(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: 'acct-1',
    organizationId: 'org1',
    legalName: 'Global Foods Ltd',
    registrationStatus: 'APPROVED',
    ...over,
  } as AccountRecord
}

/**
 * A user as the repository would return it, roles joined.
 *
 * `roles` is taken as plain names and joined here. `Omit` rather than an
 * intersection: `Partial<UserWithRoles>` already declares `roles` in its joined
 * shape, and intersecting would demand a value that is both a name and a join
 * row at once.
 */
function userRow(
  over: Omit<Partial<UserWithRoles>, 'roles'> & { roles?: Role[] } = {},
): UserWithRoles {
  const { roles = [], ...rest } = over
  return {
    id: 'u-existing',
    organizationId: 'org1',
    email: 'buyer@example.com',
    name: 'A Buyer',
    accountId: null,
    ...rest,
    roles: roles.map((name) => ({ role: { name } })),
  } as unknown as UserWithRoles
}

/**
 * A store that behaves like the real repository in the ways these tests turn on:
 * email is unique and lower-cased, a user carries exactly the roles written for
 * them, and `accountId` is persisted.
 */
function harness(options: { account?: AccountRecord | null; seed?: UserWithRoles[] } = {}) {
  const rows: UserWithRoles[] = [...(options.seed ?? [])]
  const emitted: DomainEvent[] = []

  const users = {
    async findByEmail(email: string) {
      return rows.find((r) => r.email === email.toLowerCase()) ?? null
    },
    async createWithInvite(
      ctx: { organizationId: string },
      data: { email: string; name: string; roleName: string; accountId?: string },
    ) {
      const email = data.email.trim().toLowerCase()
      if (rows.some((r) => r.email === email)) throw new Error('unique constraint: email')
      const created = userRow({
        id: `u-${rows.length + 1}`,
        email,
        name: data.name,
        accountId: data.accountId ?? null,
        roles: [data.roleName as Role],
      })
      created.organizationId = ctx.organizationId
      rows.push(created)
      return { id: created.id, email: created.email, name: created.name }
    },
  } as unknown as UserRepository & { findByEmail(email: string): Promise<UserWithRoles | null> }

  const service = createExternalProvisioningService({
    accounts: {
      async findById(orgId: string, id: string) {
        const account = options.account === undefined ? accountRow() : options.account
        if (!account) return null
        return account.organizationId === orgId && account.id === id ? account : null
      },
    },
    users,
    events: { emit: async (e: DomainEvent) => void emitted.push(e) } as unknown as EventBus,
    hashPassword: async (plain: string) => `hashed:${plain}`,
  })

  return { service, rows, emitted }
}

const DTO = { name: 'A Buyer', email: 'buyer@example.com' }

describe('who may provision a portal login', () => {
  it('lets an ADMIN provision', async () => {
    const { service } = harness()
    await expect(service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)).resolves.toMatchObject({
      status: 'provisioned',
    })
  })

  it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']] as const)(
    'refuses a %s',
    async (role) => {
      // `manage User` and `manage Account` are both ADMIN alone. Anyone who
      // could provision could hand out a credential for a customer's records.
      const { service, rows } = harness()
      await expect(service.provision(ctxFor([role]), 'acct-1', DTO)).rejects.toThrowError()
      expect(rows).toHaveLength(0)
    },
  )

  it('refuses an EXTERNAL_PARTY outright', async () => {
    // The role holds no ability at all, so this is refused by the same gate -
    // but worth asserting, because an external party provisioning logins for
    // accounts would be the worst version of this endpoint going wrong.
    const { service, rows } = harness()
    await expect(
      service.provision(ctxFor(['EXTERNAL_PARTY']), 'acct-1', DTO),
    ).rejects.toThrowError()
    expect(rows).toHaveLength(0)
  })
})

describe('eligibility', () => {
  it('provisions an APPROVED account', async () => {
    const { service, rows } = harness()
    const result = await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)

    expect(result.status).toBe('provisioned')
    expect(rows).toHaveLength(1)
  })

  it.each(['PENDING_REVIEW', 'REJECTED', 'BLOCKED', 'INACTIVE', 'DRAFT'] as const)(
    'refuses a %s account and writes nothing',
    async (status) => {
      // Every non-approved state, not a sample. PENDING_REVIEW is a stranger who
      // filled in a form; BLOCKED is a decision to keep them out. Handing either
      // a credential would undo the review that produced the state.
      const { service, rows } = harness({ account: accountRow({ registrationStatus: status }) })
      await expect(service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)).rejects.toThrowError(
        new RegExp(status),
      )
      expect(rows).toHaveLength(0)
    },
  )

  it('refuses an account that does not exist', async () => {
    const { service, rows } = harness({ account: null })
    await expect(service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)).rejects.toThrowError(
      /not found/i,
    )
    expect(rows).toHaveLength(0)
  })

  it('refuses an account belonging to another organization', async () => {
    // Not found rather than forbidden: the answer that discloses least, and the
    // scope is applied in the query rather than checked afterwards.
    const { service } = harness({ account: accountRow({ organizationId: 'org2' }) })
    await expect(service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)).rejects.toThrowError(
      /not found/i,
    )
  })
})

describe('what provisioning actually writes', () => {
  it('links the user to the account', async () => {
    const { service, rows } = harness()
    await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)

    expect(rows[0]?.accountId).toBe('acct-1')
  })

  it('gives them EXTERNAL_PARTY and nothing else', async () => {
    const { service, rows } = harness()
    await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)

    // Exactly, not "includes". A user holding EXTERNAL_PARTY beside READ_ONLY
    // would carry `read all` into a customer's portal.
    expect(rows[0]?.roles.map((r) => r.role.name)).toEqual(['EXTERNAL_PARTY'])
  })

  it('returns an invitation token that expires', async () => {
    const { service } = harness()
    const result = await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)

    if (result.status !== 'provisioned') throw new Error('expected a fresh provision')
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('records the provisioning as an event carrying no credential', async () => {
    const { service, emitted } = harness()
    const result = await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)
    if (result.status !== 'provisioned') throw new Error('expected a fresh provision')

    const event = emitted.find((e) => e.type === 'account.login_provisioned')
    expect(event).toBeDefined()
    // The payload reaches the activity feed and the logs.
    expect(JSON.stringify(event?.data)).not.toContain(result.token)
  })
})

describe('email normalisation', () => {
  it('stores a mixed-case address in lower case', async () => {
    const { service, rows } = harness()
    await service.provision(ctxFor(['ADMIN']), 'acct-1', { ...DTO, email: 'Buyer@Example.COM' })

    // `findByEmail` lower-cases before looking up, so a row stored with capitals
    // is a row nobody can sign in as.
    expect(rows[0]?.email).toBe('buyer@example.com')
  })

  it('treats a differently-cased address as the same person', async () => {
    // The collision this prevents: two users for one human, each with their own
    // invitation, only one of which can ever sign in.
    const { service, rows } = harness()
    await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)
    const second = await service.provision(ctxFor(['ADMIN']), 'acct-1', {
      ...DTO,
      email: 'BUYER@EXAMPLE.COM',
    })

    expect(second.status).toBe('already_linked')
    expect(rows).toHaveLength(1)
  })

  it('ignores surrounding whitespace', async () => {
    const { service, rows } = harness()
    await service.provision(ctxFor(['ADMIN']), 'acct-1', { ...DTO, email: '  buyer@example.com  ' })

    expect(rows[0]?.email).toBe('buyer@example.com')
  })
})

describe('repeating the request', () => {
  it('is idempotent for the same account', async () => {
    const { service, rows } = harness()
    const first = await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)
    const second = await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)

    expect(first.status).toBe('provisioned')
    expect(second.status).toBe('already_linked')
    expect(second.user.id).toBe(first.user.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.roles.map((r) => r.role.name)).toEqual(['EXTERNAL_PARTY'])
  })

  it('issues no second invitation on a repeat', async () => {
    // A fresh token on every press would leave several live credentials for one
    // person, and let anyone who can call this replace the pending invitation.
    const { service } = harness()
    await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)
    const second = await service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)

    expect(second).not.toHaveProperty('token')
  })
})

describe('collisions with somebody who already exists', () => {
  it.each([['ADMIN'], ['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']] as const)(
    'refuses an email belonging to a %s',
    async (role) => {
      const staff = userRow({ id: 'staff1', email: 'buyer@example.com', roles: [role] })
      const { service, rows } = harness({ seed: [staff] })

      await expect(service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)).rejects.toThrowError(
        /internal user/i,
      )

      // The invariant is about what did NOT change: no second role beside the
      // one they hold, and no account attached to a member of staff.
      expect(rows).toHaveLength(1)
      expect(rows[0]?.roles.map((r) => r.role.name)).toEqual([role])
      expect(rows[0]?.accountId).toBeNull()
    },
  )

  it('refuses to move an external user to a different account', async () => {
    const other = userRow({
      id: 'u-other',
      email: 'buyer@example.com',
      accountId: 'acct-2',
      roles: ['EXTERNAL_PARTY'],
    })
    const { service, rows } = harness({ seed: [other] })

    await expect(service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)).rejects.toThrowError(
      /different account/i,
    )

    // Still attached to the account they were attached to. Moving them would
    // hand acct-1's records to somebody acct-2 chose.
    expect(rows[0]?.accountId).toBe('acct-2')
  })

  it('refuses an external user linked to no account at all', async () => {
    // Should not occur - this service always sets the link - so adopting it
    // would mean guessing how it came about. Refused rather than repaired.
    const orphan = userRow({ email: 'buyer@example.com', roles: ['EXTERNAL_PARTY'] })
    const { service, rows } = harness({ seed: [orphan] })

    await expect(service.provision(ctxFor(['ADMIN']), 'acct-1', DTO)).rejects.toThrowError(
      /not linked to any account/i,
    )
    expect(rows[0]?.accountId).toBeNull()
  })
})

describe('suppliers are out of reach, structurally', () => {
  it('has no way to name a supplier, because provisioning takes an Account', async () => {
    // Not an omission. A self-registered supplier has no Account: supplier
    // registration calls `supplier.create` alone, and `Supplier.accountId` is a
    // nullable scalar with no relation and no foreign key. There is therefore no
    // id such a supplier could pass here, and the account lookup answers "not
    // found" for anything that is not an Account in this tenant.
    //
    // Asserted rather than skipped, so this states the reason rather than
    // leaving a silent gap - and fails if somebody later makes Account lookup
    // accept a supplier id.
    const { service, rows } = harness({ account: null })
    await expect(
      service.provision(ctxFor(['ADMIN']), 'supplier-id-not-an-account', DTO),
    ).rejects.toThrowError(/not found/i)
    expect(rows).toHaveLength(0)
  })
})
