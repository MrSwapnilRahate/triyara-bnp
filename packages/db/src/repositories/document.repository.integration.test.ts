import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { accountRepository } from './account.repository'
import { documentRepository } from './document.repository'

describe.skipIf(!process.env.DATABASE_URL)('documentRepository (integration)', () => {
  let orgId = ''
  let userId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'doc-itest' },
      update: {},
      create: { name: 'Doc IT Org', slug: 'doc-itest' },
    })
    orgId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'doc-it@triyara.test' },
      update: {},
      create: {
        organizationId: orgId,
        email: 'doc-it@triyara.test',
        name: 'IT',
        passwordHash: 'x',
      },
    })
    userId = user.id
  })

  it('uploads, versions, dedupes, updates, deletes, restores with audit', async () => {
    const ctx = { actorId: userId, organizationId: orgId, requestId: 'r1' }
    const account = await accountRepository.create(ctx, { legalName: `Doc ${Date.now()}` })

    const doc = await documentRepository.create(ctx, {
      accountId: account.id,
      type: 'GST',
      title: 'GST Cert',
      mimeType: 'application/pdf',
      originalFilename: 'gst.pdf',
      storageKey: `${orgId}/${account.id}/a/gst.pdf`,
      fileSize: 100,
      checksum: 'chk-1',
    })
    expect(doc.currentFileVersion).toBe(1)
    expect(doc.versions).toHaveLength(1)
    expect(doc.status).toBe('RECEIVED')

    // duplicate content for same account+type
    await expect(
      documentRepository.create(ctx, {
        accountId: account.id,
        type: 'GST',
        title: 'dup',
        mimeType: 'application/pdf',
        originalFilename: 'gst.pdf',
        storageKey: `${orgId}/${account.id}/b/gst.pdf`,
        fileSize: 100,
        checksum: 'chk-1',
      }),
    ).rejects.toThrow(/identical/i)

    const updated = await documentRepository.mutate(
      ctx,
      doc.id,
      doc.version,
      { title: 'GST Certificate' },
      'document.updated',
    )
    expect(updated.title).toBe('GST Certificate')
    expect(updated.version).toBe(2)

    const v2 = await documentRepository.addVersion(ctx, doc.id, updated.version, {
      storageKey: `${orgId}/${account.id}/c/gst-2.pdf`,
      mimeType: 'application/pdf',
      originalFilename: 'gst-2.pdf',
      fileSize: 120,
      checksum: 'chk-2',
    })
    expect(v2.currentFileVersion).toBe(2)
    expect(v2.versions).toHaveLength(2)

    const listed = await documentRepository.list(orgId, {
      limit: 50,
      type: 'GST',
      accountId: account.id,
    })
    expect(listed.items.some((d) => d.id === doc.id)).toBe(true)

    const deleted = await documentRepository.softDelete(ctx, doc.id, v2.version)
    expect(deleted.deletedAt).not.toBeNull()
    const restored = await documentRepository.restore(ctx, doc.id, deleted.version)
    expect(restored.deletedAt).toBeNull()

    const audits = await prisma.auditLog.count({
      where: { entityType: 'Document', entityId: doc.id },
    })
    expect(audits).toBeGreaterThanOrEqual(5)
  })

  /**
   * `listDocumentsForBuyer` against a real database.
   *
   * The portal read is unit-tested with an in-memory table, which proves the
   * service passes the right scopes but says nothing about the query that
   * actually runs. Batch E showed the difference plainly: removing
   * `organizationId` from a real `where` broke no test in the entire suite,
   * because the only thing exercising it was a fake.
   *
   * The fixture puts TWO accounts in ONE organization and a third in another,
   * so a dropped clause returns somebody else's document rather than an empty
   * list - a mistake that reads as data appearing, not data missing. Every row
   * carries a storage key and a checksum on purpose: the projection has to be
   * the thing that keeps them out, not their absence from the fixture.
   */
  describe('listDocumentsForBuyer', () => {
    let otherOrgId = ''
    let mine = ''
    let sibling = ''
    let otherOrgAccount = ''
    const tag = Date.now().toString(36)

    beforeAll(async () => {
      const other = await prisma.organization.upsert({
        where: { slug: 'doc-itest-other' },
        update: {},
        create: { name: 'Doc IT Other', slug: 'doc-itest-other' },
      })
      otherOrgId = other.id

      const otherUser = await prisma.user.upsert({
        where: { email: 'doc-it-other@triyara.test' },
        update: {},
        create: {
          organizationId: otherOrgId,
          email: 'doc-it-other@triyara.test',
          name: 'Other',
          passwordHash: 'x',
        },
      })

      const ctxA = { actorId: userId, organizationId: orgId, requestId: 'r1' }
      const ctxB = { actorId: otherUser.id, organizationId: otherOrgId, requestId: 'r1' }

      mine = (await accountRepository.create(ctxA, { legalName: `Doc Mine ${tag}` })).id
      sibling = (await accountRepository.create(ctxA, { legalName: `Doc Sibling ${tag}` })).id
      otherOrgAccount = (await accountRepository.create(ctxB, { legalName: `Doc Other ${tag}` })).id

      const row = (
        organizationId: string,
        accountId: string,
        suffix: string,
        deletedAt: Date | null = null,
      ) => ({
        organizationId,
        accountId,
        type: 'GST' as const,
        status: 'RECEIVED' as const,
        title: `Doc ${tag} ${suffix}`,
        currentFileVersion: 1,
        // INTERNAL. Present on every row on purpose.
        currentStorageKey: `${organizationId}/${accountId}/key-${suffix}/file.pdf`,
        currentMimeType: 'application/pdf',
        currentOriginalFilename: `file-${suffix}.pdf`,
        currentFileSize: 1024,
        currentChecksum: `sha256-${suffix}-9111111`,
        createdById: organizationId === orgId ? userId : otherUser.id,
        updatedById: organizationId === orgId ? userId : otherUser.id,
        deletedAt,
      })

      await prisma.document.createMany({
        data: [
          row(orgId, mine, 'MINE'),
          row(orgId, mine, 'MINE2'),
          row(orgId, mine, 'DELETED', new Date()),
          row(orgId, sibling, 'SIBLING'),
          row(otherOrgId, otherOrgAccount, 'OTHERORG'),
        ],
      })
    })

    it('returns the documents on the account', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      expect(items.map((d) => d.title).sort()).toEqual([`Doc ${tag} MINE`, `Doc ${tag} MINE2`])
    })

    it('returns more than one when the account owns more than one', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      expect(items.length).toBeGreaterThanOrEqual(2)
    })

    it('excludes another account in the same organization', async () => {
      // The row exists in this tenant and only the account differs. Drop the
      // account clause and this returns SIBLING.
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      expect(items.map((d) => d.title)).not.toContain(`Doc ${tag} SIBLING`)
    })

    it('excludes another organization&rsquo;s documents', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      expect(items.map((d) => d.title)).not.toContain(`Doc ${tag} OTHERORG`)
    })

    it('enforces the organization in the query, not afterwards', async () => {
      // Asking the other organization for this organization's account must find
      // nothing. Without the org clause this returns MINE.
      const { items } = await documentRepository.listDocumentsForBuyer(otherOrgId, mine)
      expect(items).toEqual([])
    })

    it('does not leak the other organization&rsquo;s account into this one', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, otherOrgAccount)
      expect(items).toEqual([])
    })

    it('excludes soft-deleted documents', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      expect(items.map((d) => d.title)).not.toContain(`Doc ${tag} DELETED`)
    })

    it('returns an empty list for an account that owns nothing', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, 'no-such-account')
      expect(items).toEqual([])
    })

    it('returns nothing for an empty account id, rather than the whole tenant', async () => {
      // The scopes are passed unconditionally, so an empty string compiles to
      // `= ''` and matches nothing. Written as `...(accountId ? { accountId } :
      // {})` it would instead be omitted - Prisma drops an `undefined` clause
      // rather than failing - and this call would answer with every document in
      // the organization. That is the difference this asserts, and no other test
      // here can see it, because every other one passes a real id.
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, '')
      expect(items).toEqual([])
    })

    it('returns nothing for an empty organization id', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer('', mine)
      expect(items).toEqual([])
    })

    it('selects no storage key, checksum, staff or scope column', async () => {
      // The projection is applied at the database, so these never enter the
      // process. Asserted on the returned row's own keys.
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      const row = items[0]!

      expect(Object.keys(row).sort()).toEqual([
        'createdAt',
        'currentFileSize',
        'currentMimeType',
        'currentOriginalFilename',
        'expiryDate',
        'issuedDate',
        'status',
        'title',
        'type',
      ])
    })

    it('fetches neither the storage key nor the checksum', async () => {
      // Both hold a value on every fixture row. They are absent because they
      // were never asked for - which is what stops a file being reachable.
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      const serialized = JSON.stringify(items)

      expect(serialized).not.toContain('key-MINE')
      expect(serialized).not.toContain('sha256-MINE')
      expect(serialized).not.toContain('9111111')
    })

    it('fetches no staff identifier', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      expect(JSON.stringify(items)).not.toContain(userId)
    })

    it('reports hasMore without handing back a cursor', async () => {
      const page = await documentRepository.listDocumentsForBuyer(orgId, mine, 1)
      expect(page.items).toHaveLength(1)
      expect(page.hasMore).toBe(true)
      // `encodeCursor` is base64url of the row id, so a cursor would put the
      // database id back into a buyer-facing payload.
      expect(page).not.toHaveProperty('nextCursor')
    })

    it('counts exactly what the list returns', async () => {
      // The overview tile and the documents page must never disagree. Compared
      // against the list rather than a fixed number so the two cannot drift.
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      expect(await documentRepository.countDocumentsForBuyer(orgId, mine)).toBe(items.length)
    })

    it('counts each account separately, never the tenant', async () => {
      const mineCount = await documentRepository.countDocumentsForBuyer(orgId, mine)
      const siblingCount = await documentRepository.countDocumentsForBuyer(orgId, sibling)
      const tenantTotal = await prisma.document.count({
        where: { organizationId: orgId, deletedAt: null },
      })

      expect(siblingCount).toBe(1)
      // The tenant holds both accounts' documents plus the soft-deleted one is
      // excluded, so a count without the account clause could not equal either.
      expect(tenantTotal).toBeGreaterThan(mineCount)
      expect(tenantTotal).toBeGreaterThan(siblingCount)
    })

    it('counts nothing across tenants', async () => {
      expect(await documentRepository.countDocumentsForBuyer(otherOrgId, mine)).toBe(0)
      expect(await documentRepository.countDocumentsForBuyer(orgId, otherOrgAccount)).toBe(0)
    })

    it('counts nothing for an empty account rather than the whole tenant', async () => {
      expect(await documentRepository.countDocumentsForBuyer(orgId, '')).toBe(0)
    })

    it('counts nothing for an empty organization', async () => {
      expect(await documentRepository.countDocumentsForBuyer('', mine)).toBe(0)
    })

    it('does not count a soft-deleted document', async () => {
      const { items } = await documentRepository.listDocumentsForBuyer(orgId, mine)
      const count = await documentRepository.countDocumentsForBuyer(orgId, mine)
      // The fixture holds a deleted document for this account; neither the list
      // nor the count may include it.
      expect(count).toBe(items.length)
      expect(items.map((d) => d.title)).not.toContain(`Doc ${tag} DELETED`)
    })

    it('does not report more when the page holds everything', async () => {
      const page = await documentRepository.listDocumentsForBuyer(orgId, mine, 50)
      expect(page.hasMore).toBe(false)
    })
  })
})
