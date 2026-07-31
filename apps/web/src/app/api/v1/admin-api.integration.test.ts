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
})
