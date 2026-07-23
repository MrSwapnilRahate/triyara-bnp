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
})
