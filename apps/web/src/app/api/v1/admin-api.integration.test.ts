// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full stack: route handler -> service -> repository -> real PostgreSQL. Only
// the auth context is mocked, so authorization, org isolation and the audit
// trail's own contents are exercised for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'admin-it@triyara.test',
      name: 'Admin IT',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const { GET: listAudit } = await import('./audit/route')
const { GET: getOrganization, PATCH: patchOrganization } = await import('./organization/route')
const { GET: getMe, PATCH: patchMe } = await import('./me/route')
const { GET: getSummary } = await import('./dashboard/summary/route')
const { GET: getTrends } = await import('./dashboard/trends/route')
const { POST: changePassword } = await import('./me/password/route')
const { GET: searchUsers } = await import('./users/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; pagination?: { nextCursor: string | null }; [k: string]: unknown }
    errors: Array<{ code: string; message: string }> | null
  }

const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)

describe.skipIf(!process.env.DATABASE_URL)('admin API (integration, real PostgreSQL)', () => {
  let otherOrgId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'admin-api-itest' },
      update: {},
      create: { name: 'Admin API IT', slug: 'admin-api-itest' },
    })
    authState.organizationId = org.id

    const user = await prisma.user.upsert({
      where: { email: 'admin-it@triyara.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'admin-it@triyara.test',
        name: 'Admin IT',
        passwordHash: 'x',
      },
    })
    authState.userId = user.id

    const other = await prisma.organization.upsert({
      where: { slug: 'admin-api-itest-other' },
      update: {},
      create: { name: 'Other Tenant', slug: 'admin-api-itest-other' },
    })
    otherOrgId = other.id
  })

  async function writeAuditRow(over: Record<string, unknown> = {}) {
    return prisma.auditLog.create({
      data: {
        organizationId: authState.organizationId,
        entityType: 'RFQ',
        entityId: `r-${uniq()}`,
        actorId: authState.userId,
        action: `rfq.${uniq()}`,
        after: { status: 'ISSUED' },
        requestId: `req-${uniq()}`,
        ...over,
      },
    })
  }

  describe('audit trail', () => {
    it('reads back a row written by the platform, with its before/after payload', async () => {
      const row = await writeAuditRow({
        before: { status: 'APPROVED' },
        after: { status: 'ISSUED' },
      })
      const res = await listAudit(req(`/api/v1/audit?entityId=${row.entityId}`))
      expect(res.status).toBe(200)

      const items = (await body(res)).data as unknown as Array<{
        id: string
        before: unknown
        after: unknown
        action: string
      }>
      expect(items).toHaveLength(1)
      // The payloads are the point of an audit trail: without them a row says
      // that something changed but not what it changed from.
      expect(items[0]!.before).toEqual({ status: 'APPROVED' })
      expect(items[0]!.after).toEqual({ status: 'ISSUED' })
    })

    it('returns the newest first', async () => {
      const entityId = `r-${uniq()}`
      await writeAuditRow({ entityId, action: 'rfq.created' })
      await writeAuditRow({ entityId, action: 'rfq.issued' })

      const items = (await body(await listAudit(req(`/api/v1/audit?entityId=${entityId}`))))
        .data as unknown as Array<{ action: string }>
      expect(items.map((i) => i.action)).toEqual(['rfq.issued', 'rfq.created'])
    })

    it('pages by cursor without repeating or skipping a row', async () => {
      const entityId = `r-${uniq()}`
      for (let i = 0; i < 5; i += 1) await writeAuditRow({ entityId, action: `step.${i}` })

      const first = await body(await listAudit(req(`/api/v1/audit?entityId=${entityId}&limit=2`)))
      const cursor = first.meta.pagination!.nextCursor
      expect(cursor).toBeTruthy()

      const second = await body(
        await listAudit(req(`/api/v1/audit?entityId=${entityId}&limit=2&cursor=${cursor}`)),
      )
      const ids = [
        ...(first.data as unknown as Array<{ id: string }>),
        ...(second.data as unknown as Array<{ id: string }>),
      ].map((r) => r.id)
      expect(new Set(ids).size).toBe(4)
    })

    it('filters by action and by entityType', async () => {
      const action = `quotation.${uniq()}`
      await writeAuditRow({ entityType: 'Quotation', action })

      const byAction = (await body(await listAudit(req(`/api/v1/audit?action=${action}`))))
        .data as unknown as unknown[]
      expect(byAction).toHaveLength(1)

      const byType = (await body(await listAudit(req(`/api/v1/audit?entityType=Quotation`))))
        .data as unknown as Array<{ entityType: string }>
      expect(byType.every((r) => r.entityType === 'Quotation')).toBe(true)
    })

    it('never returns another tenant rows', async () => {
      const foreignEntity = `r-${uniq()}`
      await prisma.auditLog.create({
        data: {
          organizationId: otherOrgId,
          entityType: 'RFQ',
          entityId: foreignEntity,
          actorId: authState.userId,
          action: 'rfq.secret',
        },
      })
      const items = (await body(await listAudit(req(`/api/v1/audit?entityId=${foreignEntity}`))))
        .data as unknown as unknown[]
      expect(items).toEqual([])
    })

    it('is refused to every role below ADMIN', async () => {
      await writeAuditRow()
      for (const role of ['EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as Role[]) {
        authState.roles = [role]
        const res = await listAudit(req('/api/v1/audit'))
        // `read all` is not enough: the trail is more revealing than any single
        // module read, so it needs `manage Organization`.
        expect(res.status).toBe(403)
      }
      authState.roles = ['ADMIN']
    })
  })

  describe('organization settings', () => {
    it('reads and renames the caller own tenant', async () => {
      const name = `Renamed ${uniq()}`
      const patched = await patchOrganization(
        req('/api/v1/organization', { method: 'PATCH', body: JSON.stringify({ name }) }),
      )
      expect(patched.status).toBe(200)

      const read = await body(await getOrganization(req('/api/v1/organization')))
      expect((read.data as unknown as { name: string }).name).toBe(name)
    })

    it('leaves the slug alone even when one is submitted', async () => {
      const before = (await body(await getOrganization(req('/api/v1/organization'))))
        .data as unknown as { slug: string }
      await patchOrganization(
        req('/api/v1/organization', {
          method: 'PATCH',
          body: JSON.stringify({ name: `Slug test ${uniq()}`, slug: 'hijacked' }),
        }),
      )
      const after = (await body(await getOrganization(req('/api/v1/organization'))))
        .data as unknown as { slug: string }
      expect(after.slug).toBe(before.slug)
    })

    it('is readable by a read-only role but not writable', async () => {
      authState.roles = ['READ_ONLY']
      expect((await getOrganization(req('/api/v1/organization'))).status).toBe(200)
      const write = await patchOrganization(
        req('/api/v1/organization', { method: 'PATCH', body: JSON.stringify({ name: 'Nope' }) }),
      )
      expect(write.status).toBe(403)
      authState.roles = ['ADMIN']
    })
  })

  describe('profile', () => {
    it('returns the signed-in user with their roles', async () => {
      const profile = (await body(await getMe(req('/api/v1/me')))).data as unknown as {
        email: string
        organizationId: string
      }
      expect(profile.email).toBe('admin-it@triyara.test')
      expect(profile.organizationId).toBe(authState.organizationId)
    })

    it('renames the caller and reads the new name back', async () => {
      const name = `Ada ${uniq()}`
      const res = await patchMe(
        req('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
      )
      expect(res.status).toBe(200)
      expect(
        ((await body(await getMe(req('/api/v1/me')))).data as unknown as { name: string }).name,
      ).toBe(name)
    })

    it('cannot be used to change email or roles', async () => {
      const before = (await body(await getMe(req('/api/v1/me')))).data as unknown as {
        email: string
        roles: string[]
      }
      await patchMe(
        req('/api/v1/me', {
          method: 'PATCH',
          body: JSON.stringify({
            name: `Still me ${uniq()}`,
            email: 'root@evil.test',
            roles: ['ADMIN'],
          }),
        }),
      )
      const after = (await body(await getMe(req('/api/v1/me')))).data as unknown as {
        email: string
        roles: string[]
      }
      expect(after.email).toBe(before.email)
      expect(after.roles).toEqual(before.roles)
    })

    it('works for a read-only role - it is the caller own record', async () => {
      authState.roles = ['READ_ONLY']
      expect((await getMe(req('/api/v1/me'))).status).toBe(200)
      authState.roles = ['ADMIN']
    })
  })

  describe('dashboard summary', () => {
    it('counts only this tenant records', async () => {
      const res = await getSummary(req('/api/v1/dashboard/summary'))
      expect(res.status).toBe(200)
      const summary = (await body(res)).data as unknown as {
        rfqs: { total: number; pendingApproval: number }
        quotations: { pendingApproval: number }
        pendingApprovals: number
      }
      // This org has no sourcing records of its own, so every count is zero -
      // which is the assertion that matters: a leaking query would show the
      // other tenants' rows here.
      expect(summary.rfqs.total).toBe(0)
      expect(summary.pendingApprovals).toBe(
        summary.rfqs.pendingApproval + summary.quotations.pendingApproval,
      )
    })
  })

  describe('dashboard trends', () => {
    it('returns a dense monthly series, zero-filled', async () => {
      const res = await getTrends(req('/api/v1/dashboard/trends?window=3m'))
      expect(res.status).toBe(200)
      const trends = (await body(res)).data as unknown as {
        rfqs: Array<{ month: string; count: number }>
        window: { months: number }
      }
      // A gap must read as "nothing happened", not as a missing month, or a
      // chart silently compresses its own x-axis.
      expect(trends.rfqs).toHaveLength(3)
      expect(trends.window.months).toBe(3)
      expect(trends.rfqs.every((p) => Number.isInteger(p.count))).toBe(true)
    })

    it('orders the funnel by lifecycle, not by size', async () => {
      const trends = (await body(await getTrends(req('/api/v1/dashboard/trends'))))
        .data as unknown as { approvalFunnel: { rfqs: Array<{ stage: string }> } }
      expect(trends.approvalFunnel.rfqs.map((s) => s.stage)).toEqual([
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'ISSUED',
        'AWARDED',
      ])
    })

    it('counts only this tenant', async () => {
      const trends = (await body(await getTrends(req('/api/v1/dashboard/trends'))))
        .data as unknown as { rfqs: Array<{ count: number }> }
      // This org has no sourcing records; a leaking query would show others'.
      expect(trends.rfqs.reduce((n, p) => n + p.count, 0)).toBe(0)
    })
  })

  describe('organization settings beyond the name', () => {
    it('stores currency, timezone, date format and language', async () => {
      const res = await patchOrganization(
        req('/api/v1/organization', {
          method: 'PATCH',
          body: JSON.stringify({
            defaultCurrency: 'EUR',
            timezone: 'Europe/Berlin',
            dateFormat: 'YYYY-MM-DD',
            language: 'fr',
          }),
        }),
      )
      expect(res.status).toBe(200)
      const org = (await body(await getOrganization(req('/api/v1/organization'))))
        .data as unknown as Record<string, string>
      expect(org).toMatchObject({
        defaultCurrency: 'EUR',
        timezone: 'Europe/Berlin',
        dateFormat: 'YYYY-MM-DD',
        language: 'fr',
      })
    })

    it('changes one setting without restating the rest', async () => {
      await patchOrganization(
        req('/api/v1/organization', {
          method: 'PATCH',
          body: JSON.stringify({ defaultCurrency: 'GBP', timezone: 'Europe/London' }),
        }),
      )
      await patchOrganization(
        req('/api/v1/organization', { method: 'PATCH', body: JSON.stringify({ language: 'hi' }) }),
      )
      const org = (await body(await getOrganization(req('/api/v1/organization'))))
        .data as unknown as Record<string, string>
      expect(org.timezone).toBe('Europe/London')
      expect(org.language).toBe('hi')
    })

    it('rejects a malformed currency', async () => {
      const res = await patchOrganization(
        req('/api/v1/organization', {
          method: 'PATCH',
          body: JSON.stringify({ defaultCurrency: 'euro' }),
        }),
      )
      expect(res.status).toBe(422)
    })
  })

  describe('profile beyond the name', () => {
    it('stores an avatar and free-form preferences', async () => {
      const res = await patchMe(
        req('/api/v1/me', {
          method: 'PATCH',
          body: JSON.stringify({
            avatarUrl: 'https://cdn.test/a.png',
            preferences: { density: 'compact', landingTab: 'rfqs' },
          }),
        }),
      )
      expect(res.status).toBe(200)
      const me = (await body(await getMe(req('/api/v1/me')))).data as unknown as {
        avatarUrl: string
        preferences: Record<string, unknown>
      }
      expect(me.avatarUrl).toBe('https://cdn.test/a.png')
      expect(me.preferences).toEqual({ density: 'compact', landingTab: 'rfqs' })
    })

    it('rejects an avatar that is not a URL', async () => {
      const res = await patchMe(
        req('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ avatarUrl: 'not-a-url' }) }),
      )
      expect(res.status).toBe(422)
    })
  })

  describe('password change', () => {
    it('refuses when the current password is wrong', async () => {
      const res = await changePassword(
        req('/api/v1/me/password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: 'definitely-not-it',
            newPassword: 'BrandNewPass1',
          }),
        }),
      )
      // The stored hash for this fixture user is 'x', so nothing verifies.
      expect(res.status).toBe(403)
    })
  })

  describe('user directory', () => {
    it('finds a colleague by name and returns only the narrow projection', async () => {
      const items = (await body(await searchUsers(req('/api/v1/users?q=admin'))))
        .data as unknown as Array<Record<string, unknown>>
      expect(items.length).toBeGreaterThan(0)
      expect(Object.keys(items[0]!).sort()).toEqual(['avatarUrl', 'email', 'id', 'name'])
    })

    it('never returns another tenant users', async () => {
      await prisma.user.upsert({
        where: { email: 'foreign-admin@triyara.test' },
        update: {},
        create: {
          organizationId: otherOrgId,
          email: 'foreign-admin@triyara.test',
          name: 'Foreign Admin',
          passwordHash: 'x',
        },
      })
      const items = (await body(await searchUsers(req('/api/v1/users?q=Foreign'))))
        .data as unknown as unknown[]
      expect(items).toEqual([])
    })
  })
})
